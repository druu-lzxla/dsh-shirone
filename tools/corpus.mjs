#!/usr/bin/env node
// 语料校验 + 转换：TSV/JSONL → 标准 JSONL
//
//   node tools/corpus.mjs sample.tsv
//   node tools/corpus.mjs a2.tsv b1.tsv --out dist/ja.jsonl
//
// 零依赖，Node 18+。退出码非 0 表示有错，错误会带行号。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, extname, basename } from 'node:path'
import { createHash } from 'node:crypto'

const SCENES = ['morning', 'work', 'break', 'night', 'return', 'weather', 'food', 'tired', 'tease', 'self']
const RANK = { A2: 2, B1: 3, B2: 4 }
const LIMITS = { A2: [6, 26], B1: [12, 40], B2: [20, 60] } // 字符数（含标点）
const KANA = /^[\u3040-\u309F\u30A0-\u30FF\u30FC\u30FB]+$/
const KANA_SENT = /^[\u3040-\u309F\u30A0-\u30FF\u30FC\u30FB、。！？…\s]+$/
const JP = /[\u3040-\u30FF]/
const ASCII_LETTER = /[A-Za-z]/

// ---------- 读取 ----------

function parseTsv(text, source) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const rows = []
  let header = null
  lines.forEach((raw, i) => {
    if (!raw.trim() || raw.trimStart().startsWith('#')) return
    const cells = raw.split('\t')
    if (header === null) {
      header = cells.map((s) => s.trim())
      return
    }
    const row = {}
    header.forEach((h, j) => { row[h] = (cells[j] ?? '').trim() })
    rows.push({ row, line: i + 1, source })
  })
  if (header === null) throw new Error(`${source}: 没有表头`)
  for (const need of ['level', 'text', 'gloss']) {
    if (!header.includes(need)) throw new Error(`${source}: 表头缺列 "${need}"（现有：${header.join(', ')}）`)
  }
  return rows
}

function parseJsonl(text, source) {
  const out = []
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim() || raw.trimStart().startsWith('#')) return
    try {
      out.push({ row: JSON.parse(raw), line: i + 1, source })
    } catch (e) {
      out.push({ row: null, line: i + 1, source, parseError: e.message })
    }
  })
  return out
}

// ---------- 规整 ----------

function parseWords(raw) {
  if (!raw) return []
  return raw.split(';').map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
    const [w = '', r = '', g = '', lv = '', lm = ''] = chunk.split('|').map((s) => s.trim())
    return { w, r, g, level: lv.toUpperCase() || undefined, lemma: lm || undefined }
  })
}

function normalize({ row, line, source, parseError }) {
  if (parseError) return { error: `${source}:${line} JSON 解析失败：${parseError}` }
  const level = String(row.level || '').toUpperCase()
  const text = String(row.text || '').trim()
  const gloss = String(row.gloss || '').trim()
  const scenes = String(row.scene || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  const words = parseWords(row.words)
  const id = String(row.id || '').trim() ||
    `ja.${level.toLowerCase()}.${scenes[0] || 'misc'}.${createHash('sha1').update(text).digest('hex').slice(0, 8)}`
  const reading = String(row.reading || '').trim()
  const note = String(row.note || '').trim()
  return { line, source, item: { id, lang: 'ja', level, text, gloss, scene: scenes, words, reading, note, rev: 1 } }
}

// ---------- 校验 ----------

function validate(item) {
  const errors = []
  const warn = []
  const { level, text, gloss, scene, words, reading } = item

  if (!RANK[level]) errors.push(`level 只能是 A2/B1/B2（收到 "${level}"）`)
  if (!text) errors.push('text 为空')
  if (!gloss) errors.push('gloss 为空')
  if (!scene.length) errors.push('scene 为空')
  for (const s of scene) if (!SCENES.includes(s)) errors.push(`未知 scene "${s}"（可用：${SCENES.join('/')}）`)

  if (RANK[level] && text) {
    const [lo, hi] = LIMITS[level]
    const n = [...text].length
    if (n < lo || n > hi) errors.push(`${level} 长度应为 ${lo}–${hi} 字符，实际 ${n}`)
  }
  if (ASCII_LETTER.test(text)) errors.push('text 里出现英文字母（不要 romaji / 英文词）')
  if (/[|;]/.test(text)) errors.push('text 里不要出现 | 或 ;（会和 words 列冲突）')
  if (text && !/[。！？…]$/.test(text)) errors.push('text 结尾要是 。！？… 之一')

  if (JP.test(gloss)) errors.push('gloss 里出现日文假名（译文请写中文）')

  if (reading) {
    if (!KANA_SENT.test(reading)) errors.push('reading 只能是假名 + 标点（不要汉字/罗马字）')
  }

  const seen = new Set()
  const overWords = []
  for (const w of words) {
    if (!w.w) { errors.push('words 里有空词面'); continue }
    if (!text.includes(w.w)) errors.push(`词面 "${w.w}" 不在 text 里`)
    if (seen.has(w.w)) errors.push(`词面 "${w.w}" 在同一行重复`)
    seen.add(w.w)
    if (!w.g) errors.push(`"${w.w}" 没有中文释义`)
    if (JP.test(w.g || '')) errors.push(`"${w.w}" 的释义里出现日文`)
    if (w.r && !KANA.test(w.r)) errors.push(`"${w.w}" 的读音不是纯假名：${w.r}`)
    if (w.level && !RANK[w.level]) errors.push(`"${w.w}" 的等级只能是 A2/B1/B2`)
    if (w.level && RANK[level] && RANK[w.level] > RANK[level]) overWords.push(w)
    if (w.lemma && /[\s|;]/.test(w.lemma)) errors.push(`"${w.w}" 的 lemma 不能有空格或分隔符：${w.lemma}`)
  }
  if (overWords.length > 1) errors.push(`超纲词 ${overWords.length} 个（每句最多 1 个）：${overWords.map((w) => w.w).join('/')}`)

  if (words.length === 0) warn.push('没有标任何词（这句只做曝光，不能点词查义）')
  return { errors, warn }
}

// ---------- 报告 ----------

function report(items) {
  const byLevel = {}
  const byScene = {}
  const lemma = new Map()
  let chars = 0
  for (const it of items) {
    byLevel[it.level] = (byLevel[it.level] || 0) + 1
    byScene[it.scene[0] || '(无)'] = (byScene[it.scene[0] || '(无)'] || 0) + 1
    chars += [...it.text].length
    for (const w of it.words) {
      const k = w.lemma || w.w
      lemma.set(k, (lemma.get(k) || 0) + 1)
    }
  }
  const counts = [...lemma.values()]
  const ge2 = counts.filter((n) => n >= 2).length
  const ge3 = counts.filter((n) => n >= 3).length
  const once = [...lemma.entries()].filter(([, n]) => n === 1).map(([k]) => k)

  const lines = []
  lines.push(`总行数 ${items.length}｜平均 ${(chars / Math.max(1, items.length)).toFixed(1)} 字符`)
  lines.push('等级：' + Object.entries(byLevel).sort().map(([k, v]) => `${k} ${v}`).join('｜'))
  lines.push('场景：' + Object.entries(byScene).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('｜'))
  lines.push(`词头 ${lemma.size}｜≥2 次 ${ge2}｜≥3 次 ${ge3}`)
  const top = [...lemma.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])
  if (top.length) lines.push(`出现 ≥2 次的词：${top.map(([k, n]) => `${k}×${n}`).join('、')}`)
  if (once.length) lines.push(`只出现 1 次的词（${once.length}）：${once.slice(0, 30).join('、')}${once.length > 30 ? '…' : ''}`)
  return lines.join('\n')
}

// ---------- 主流程 ----------

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const outPath = outIdx >= 0 ? args[outIdx + 1] : null
const inputs = outIdx >= 0 ? args.filter((_, i) => i !== outIdx && i !== outIdx + 1) : args
if (inputs.length === 0) {
  console.error('用法：node tools/corpus.mjs <文件.tsv|.jsonl> [...] [--out dist/ja.jsonl]')
  process.exit(2)
}

let rows = []
for (const file of inputs) {
  const text = readFileSync(file, 'utf8')
  const ext = extname(file).toLowerCase()
  if (ext === '.jsonl' || ext === '.json') rows = rows.concat(parseJsonl(text, basename(file)))
  else rows = rows.concat(parseTsv(text, file))
}

const errors = []
const warnings = []
const items = []
const seenText = new Map()
const seenId = new Map()

for (const row of rows) {
  const n = normalize(row)
  if (n.error) { errors.push(n.error); continue }
  const it = n.item
  const { errors: e, warn: w } = validate(it)
  for (const msg of e) errors.push(`${row.source}:${row.line} ${msg}`)
  for (const msg of w) warnings.push(`${row.source}:${row.line} ${msg}`)

  if (seenText.has(it.text)) errors.push(`${row.source}:${row.line} 与第 ${seenText.get(it.text)} 行重复`)
  else seenText.set(it.text, row.line)
  if (seenId.has(it.id)) errors.push(`${row.source}:${row.line} id 重复：${it.id}`)
  else seenId.set(it.id, row.line)

  items.push(it)
}

if (errors.length) {
  console.error(`✗ ${errors.length} 个错误：`)
  for (const e of errors) console.error('  - ' + e)
  if (warnings.length) {
    console.error(`\n⚠ ${warnings.length} 个提醒：`)
    for (const w of warnings) console.error('  - ' + w)
  }
  process.exit(1)
}

console.log('✓ 校验通过\n')
console.log(report(items))
if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} 个提醒：`)
  for (const w of warnings) console.log('  - ' + w)
}
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, items.map((it) => JSON.stringify(it)).join('\n') + '\n', 'utf8')
  console.log(`\n→ 写出 ${outPath}（${items.length} 行）`)
}
