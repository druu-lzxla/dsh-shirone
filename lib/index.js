// dsh-lingo-pet —— 宿主半边
// 只依赖 DSH 核心的 webServer；不读写任何别的插件的数据。

import { readFileSync, existsSync, statSync, appendFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { readJson, writeJsonAtomic } from './store.js'
import { shouldSpeak } from './scheduler.js'
import { pickLine, noteSaid, noteWordClick } from './selector.js'

export const name = 'lingo-pet'
export const inject = ['webServer', 'timer']

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DIR = join(HOME, 'lingo-pet')
const CFG_PATH = join(DIR, 'config.json')
const STATE_PATH = join(DIR, 'state.json')
const CORPUS_PATH = join(ROOT, 'assets', 'corpus', 'ja.jsonl')
const PREFIX = '/dsh-lingo-pet'

function diag(message) {
  try {
    mkdirSync(DIR, { recursive: true })
    appendFileSync(join(DIR, 'diag.log'), new Date().toISOString() + '  ' + message + '\n')
  } catch {
    /* 诊断失败不影响主流程 */
  }
}

const DEFAULTS = {
  enabled: true,
  lang: 'ja',
  level: 'A2',
  budget: 12,
  activeStart: 9,
  activeEnd: 23,
  quietStart: 23,
  quietEnd: 8,
  minGapMin: 6,
  showGloss: 'hover', // hover | always | off
  voice: false,
}

function normalizeConfig(raw) {
  const cfg = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) }
  const num = (v, lo, hi, d) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d
  }
  cfg.enabled = cfg.enabled !== false
  cfg.level = ['A2', 'B1', 'B2'].includes(cfg.level) ? cfg.level : 'A2'
  cfg.budget = num(cfg.budget, 4, 30, DEFAULTS.budget)
  cfg.activeStart = num(cfg.activeStart, 0, 23, DEFAULTS.activeStart)
  cfg.activeEnd = num(cfg.activeEnd, 0, 24, DEFAULTS.activeEnd)
  cfg.quietStart = num(cfg.quietStart, 0, 23, DEFAULTS.quietStart)
  cfg.quietEnd = num(cfg.quietEnd, 0, 24, DEFAULTS.quietEnd)
  cfg.minGapMin = num(cfg.minGapMin, 1, 120, DEFAULTS.minGapMin)
  cfg.showGloss = ['hover', 'always', 'off'].includes(cfg.showGloss) ? cfg.showGloss : 'hover'
  cfg.voice = Boolean(cfg.voice)
  return cfg
}

function mtimeOf(path) {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
}

function loadCorpus() {
  if (!existsSync(CORPUS_PATH)) return []
  const lines = readFileSync(CORPUS_PATH, 'utf8').split(/\r?\n/)
  const out = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const item = JSON.parse(line)
      if (item && item.id && item.text) out.push(item)
    } catch {
      /* 坏行跳过，不拖垮插件 */
    }
  }
  return out
}

function scenesFor(now) {
  const h = new Date(now).getHours()
  if (h < 5) return ['night', 'self']
  if (h < 11) return ['morning', 'self']
  if (h < 12) return ['work', 'break', 'self']
  if (h < 14) return ['food', 'break']
  if (h < 18) return ['work', 'break', 'self']
  if (h < 20) return ['food', 'return']
  if (h < 23) return ['night', 'tease', 'break', 'self']
  return ['night', 'self']
}

export function apply(ctx) {
  diag('apply start')
  let cfg = normalizeConfig(readJson(CFG_PATH, {}))
  let state = {
    day: '',
    used: 0,
    lastSpeakAt: 0,
    lastTypingAt: 0,
    pausedUntil: 0,
    ignoredStreak: 0,
    penalty: 1,
    pos: { x: 0.86, y: 0.82 },
    words: {},
    recent: [],
    ...readJson(STATE_PATH, {}),
  }

  let corpus = loadCorpus()
  let corpusMtime = mtimeOf(CORPUS_PATH)
  let current = null
  let enabled = true
  let lastTickAt = 0

  const refreshCorpus = () => {
    const m = mtimeOf(CORPUS_PATH)
    if (m !== corpusMtime) {
      corpus = loadCorpus()
      corpusMtime = m
    }
    return corpus
  }

  const saveCfg = () => writeJsonAtomic(CFG_PATH, cfg)
  const saveState = () => writeJsonAtomic(STATE_PATH, state)

  const ensureDay = (now) => {
    const day = new Date(now).toDateString()
    if (state.day !== day) {
      state.day = day
      state.used = 0
      state.ignoredStreak = 0
      state.penalty = 1
    }
  }

  const speak = (now) => {
    ensureDay(now)
    const line = pickLine({
      corpus: refreshCorpus(),
      state,
      scenes: scenesFor(now),
      level: cfg.level,
      now,
    })
    if (!line) return
    noteSaid(state, line, now)
    state.used += 1
    state.lastSpeakAt = now
    state.recent = [...(state.recent || []), { id: line.id, at: now }].slice(-300)
    current = { at: now, line, interacted: false }
    saveState()

    const marker = current
    if (typeof setTimeout === 'function') {
      setTimeout(() => {
        if (current === marker && !marker.interacted) {
          state.ignoredStreak = (state.ignoredStreak || 0) + 1
          state.penalty = Math.pow(0.5, Math.floor(state.ignoredStreak / 3))
          saveState()
        }
      }, 90_000)
    }
  }

  const tick = () => {
    try {
      const now = Date.now()
      lastTickAt = now
      ensureDay(now)
      if (!enabled) return
      const verdict = shouldSpeak({ cfg, state, now })
      if (verdict.speak) speak(now)
    } catch (error) {
      diag('tick error: ' + String((error && error.message) || error))
    }
  }

  const readBody = (req) =>
    new Promise((resolve) => {
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk
        if (raw.length > 65536) raw = raw.slice(0, 65536)
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(raw || '{}'))
        } catch {
          resolve({})
        }
      })
      req.on('error', () => resolve({}))
    })

  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  const route = (path, handler) =>
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: PREFIX + path, handler }))

  // ---- 配置 ----
  route('/config', async (req, res) => {
    if (req.method === 'POST') {
      const body = await readBody(req)
      cfg = normalizeConfig({ ...cfg, ...body })
      saveCfg()
      return json(res, 200, { ok: true, cfg, stats: stats() })
    }
    return json(res, 200, { ok: true, cfg, stats: stats() })
  })

  const stats = () => ({
    used: state.used,
    budget: Math.floor(cfg.budget * (state.penalty ?? 1)),
    pausedUntil: state.pausedUntil,
    words: Object.keys(state.words || {}).length,
    corpus: refreshCorpus().length,
    lastTickAt,
  })

  // ---- 前端轮询 ----
  route('/poll', async (req, res) => {
    const now = Date.now()
    ensureDay(now)
    let after = 0
    try {
      after = Number(new URL(req.url, 'http://x').searchParams.get('after') || 0)
    } catch {
      /* ignore */
    }
    const line = current && current.at > after ? current.line : null
    return json(res, 200, {
      now,
      enabled: enabled && cfg.enabled,
      pausedUntil: state.pausedUntil,
      pos: state.pos,
      showGloss: cfg.showGloss,
      voice: cfg.voice,
      line,
    })
  })

  // ---- 交互上报 ----
  route('/event', async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { ok: false })
    const body = await readBody(req)
    const now = Date.now()
    const kind = String(body.kind || '')

    if (kind === 'typing') state.lastTypingAt = now

    if (kind === 'hover' || kind === 'click') {
      if (current) current.interacted = true
    }

    if (kind === 'word') {
      if (current) current.interacted = true
      const lemma = String(body.lemma || body.w || '')
      if (lemma) {
        noteWordClick(state, lemma, now)
        saveState()
      }
    }

    if (kind === 'pos') {
      const x = Number(body.x)
      const y = Number(body.y)
      if (Number.isFinite(x) && Number.isFinite(y)) {
        state.pos = { x: Math.min(0.98, Math.max(0.02, x)), y: Math.min(0.98, Math.max(0.02, y)) }
        saveState()
      }
    }

    return json(res, 200, { ok: true })
  })

  // ---- 暂停 ----
  route('/pause', async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { ok: false })
    const body = await readBody(req)
    const minutes = Number(body.minutes)
    const now = Date.now()
    if (body.resume) state.pausedUntil = 0
    else if (Number.isFinite(minutes) && minutes > 0) state.pausedUntil = now + minutes * 60_000
    saveState()
    return json(res, 200, { ok: true, pausedUntil: state.pausedUntil })
  })

  // ---- 试一句（不看预算、不看时段，只为了当场看一眼） ----
  route('/preview', async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { ok: false })
    const now = Date.now()
    const line = pickLine({
      corpus: refreshCorpus(),
      state,
      scenes: scenesFor(now),
      level: cfg.level,
      now,
    })
    if (!line) return json(res, 404, { ok: false, error: 'corpus-empty' })
    current = { at: now, line, interacted: true }
    return json(res, 200, { ok: true, line })
  })

  // ---- 静态资源 ----
  const serve = (path, file, type) =>
    route(path, async (req, res) => {
      try {
        const buf = readFileSync(join(ROOT, file))
        res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
        res.end(buf)
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('not found')
      }
    })

  serve('/widget.js', 'assets/widget.js', 'application/javascript; charset=utf-8')
  serve('/pet.svg', 'assets/pet.svg', 'image/svg+xml')

  // ---- 把挂饰注入页面 ----
  ctx.on('webserver/index-inject', (table) => {
    if (!Array.isArray(table)) return
    for (const row of table) {
      if (row && typeof row.text === 'string' && row.text.includes(`${PREFIX}/widget.js`)) return
    }
    table.push({
      kind: 'script',
      placement: 'body',
      text:
        '(function(){try{var d=document.body||document.head||document.documentElement;if(!d)return;' +
        'var s=document.createElement("script");s.src="' +
        PREFIX +
        '/widget.js";s.onerror=function(){};d.appendChild(s)}catch(e){}})()',
    })
  })

  // ---- 定时器 ----
  ctx.effect(() => {
    if (typeof ctx.interval === 'function') {
      diag('timer: ctx.interval')
      return ctx.interval(tick, 60_000)
    }
    diag('timer: global setInterval')
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  })

  diag(`apply done: corpus=${corpus.length} enabled=${cfg.enabled}`)

  ctx.logger?.('lingo-pet')?.info?.(`loaded: ${corpus.length} lines, budget ${cfg.budget}/day`)
}

export const __test = { scenesFor, normalizeConfig }
