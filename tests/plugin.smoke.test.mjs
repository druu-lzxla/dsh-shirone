import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// DSH_HOME 指到临时目录，别碰真实配置
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'lingo-pet-'))

const routes = new Map()
const hooks = []
const disposers = []

const ctx = {
  webServer: {
    register({ path, handler }) {
      routes.set(path, handler)
      return () => routes.delete(path)
    },
  },
  effect(fn) {
    const d = fn()
    if (typeof d === 'function') disposers.push(d)
  },
  on(name, fn) {
    hooks.push({ name, fn })
  },
  logger: () => ({ info() {}, warn() {} }),
}

const { apply } = await import('../lib/index.js')

function fakeRes() {
  let body = ''
  return {
    status: 0,
    writeHead(code) { this.status = code },
    end(chunk) { body += chunk ?? '' },
    get json() { return JSON.parse(body || '{}') },
  }
}

const call = async (path, req = {}) => {
  const handler = routes.get('/dsh-lingo-pet' + path)
  assert.ok(handler, `路由不存在：${path}`)
  const res = fakeRes()
  await handler({ method: 'GET', url: '/dsh-lingo-pet' + path, on() {}, ...req }, res)
  return res
}

test('插件能起来，路由齐全', () => {
  apply(ctx)
  for (const p of ['/config', '/poll', '/event', '/pause', '/widget.js', '/pet.svg']) {
    assert.ok(routes.has('/dsh-lingo-pet' + p), p)
  }
})

test('挂饰脚本被注入一次', () => {
  const table = []
  const hook = hooks.find((h) => h.name === 'webserver/index-inject')
  assert.ok(hook)
  hook.fn(table)
  hook.fn(table)
  assert.equal(table.length, 1)
  assert.ok(table[0].text.includes('/dsh-lingo-pet/widget.js'))
})

test('poll 返回语料与配置', async () => {
  const res = await call('/poll', { url: '/dsh-lingo-pet/poll?after=0' })
  assert.equal(res.status, 200)
  assert.equal(res.json.showGloss, 'hover')
  assert.equal(res.json.enabled, true)
  assert.ok(res.json.now > 0)
})

test('config 能读能写', async () => {
  const read = await call('/config')
  assert.equal(read.json.cfg.budget, 12)
  assert.ok(read.json.stats.corpus >= 100)

  const write = await call('/config', { method: 'POST', on(ev, fn) { if (ev === 'end') fn() } })
  assert.equal(write.json.ok, true)
})

test('暂停接口', async () => {
  const res = await call('/pause', { method: 'POST', on(ev, fn) { if (ev === 'end') fn() } })
  assert.equal(res.json.ok, true)
})

test('清理', () => {
  for (const d of disposers) d()
})
