import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldSpeak, inWindow } from '../lib/scheduler.js'

const MIN = 60_000
const base = (h, m = 0) => new Date(2026, 10, 1, h, m, 0, 0).getTime() // 2026-11-01 本地时间

const cfg = {
  enabled: true,
  budget: 12,
  activeStart: 9,
  activeEnd: 23,
  quietStart: 23,
  quietEnd: 8,
  minGapMin: 6,
}

const fresh = (now, extra = {}) => ({
  used: 0,
  lastSpeakAt: 0,
  lastTypingAt: 0,
  pausedUntil: 0,
  penalty: 1,
  ...extra,
  __now: now,
})

const ask = (now, state, rand = () => 1) =>
  shouldSpeak({ cfg, state: fresh(now, state), now, rand })

test('跨午夜的安静时段', () => {
  assert.equal(inWindow(23 * 60 + 30, 23, 8), true)
  assert.equal(inWindow(2 * 60, 23, 8), true)
  assert.equal(inWindow(8 * 60, 23, 8), false)
  assert.equal(inWindow(12 * 60, 9, 23), true)
  assert.equal(inWindow(23 * 60, 9, 23), false)
})

test('关掉 / 暂停 / 安静 / 非活跃时段都不说', () => {
  assert.equal(ask(base(10), {}, () => 0).reason, 'ok')
  assert.equal(shouldSpeak({ cfg: { ...cfg, enabled: false }, state: fresh(base(10)), now: base(10) }).reason, 'disabled')
  assert.equal(ask(base(10), { pausedUntil: base(11) }).reason, 'paused')
  assert.equal(ask(base(2)).reason, 'quiet')
  assert.equal(ask(base(8, 30)).reason, 'inactive')
})

test('预算用完、间隔不够、正在打字都不说', () => {
  assert.equal(ask(base(10), { used: 12 }).reason, 'budget')
  assert.equal(ask(base(10), { lastSpeakAt: base(9) + 59 * MIN }).reason, 'gap')
  assert.equal(ask(base(10), { lastTypingAt: base(10) - 30_000 }).reason, 'typing')
})

test('预算减半后按减半算', () => {
  assert.equal(ask(base(10), { used: 6, penalty: 0.5 }).reason, 'budget')
})

test('概率随剩余预算摊平：越晚 p 越大', () => {
  const morning = shouldSpeak({ cfg, state: fresh(base(9)), now: base(9), rand: () => 1 })
  const evening = shouldSpeak({ cfg, state: fresh(base(22)), now: base(22), rand: () => 1 })
  assert.ok(evening.p > morning.p)
  assert.equal(morning.speak, false)
})
