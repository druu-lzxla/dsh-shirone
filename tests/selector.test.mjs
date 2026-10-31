import test from 'node:test'
import assert from 'node:assert/strict'
import { pickLine, noteSaid, noteWordClick, lemmaOf } from '../lib/selector.js'

const NOW = new Date(2026, 10, 1, 10, 0, 0, 0).getTime()
const DAY = 86_400_000

const corpus = [
  { id: 'a', level: 'A2', scene: ['morning'], text: 'おはよう。', gloss: '早。', words: [{ w: 'おはよう', g: '早' }] },
  { id: 'b', level: 'A2', scene: ['morning'], text: '目が疲れた。', gloss: '眼睛累了。', words: [{ w: '目', g: '眼睛' }, { w: '疲れた', g: '累', lemma: '疲れる' }] },
  { id: 'c', level: 'B1', scene: ['morning'], text: '今日は風が強いですね。', gloss: '今天风很大。', words: [{ w: '風', g: '风' }] },
]

const state = (extra = {}) => ({ words: {}, recent: [], ...extra })

test('等级过滤：A2 看不到 B1', () => {
  const line = pickLine({ corpus, state: state(), scenes: ['morning'], level: 'A2', now: NOW, rand: () => 0.5 })
  assert.notEqual(line.id, 'c')
})

test('场景不匹配就不选', () => {
  const line = pickLine({ corpus, state: state(), scenes: ['work'], level: 'A2', now: NOW, rand: () => 0.5 })
  assert.equal(line, null)
})

test('到期的词会优先', () => {
  const st = state({ words: { 目: { seen: 2, clicked: 0, lastSeen: NOW - 5 * DAY, interval: 1, ease: 2 } } })
  for (let i = 0; i < 20; i++) {
    const line = pickLine({ corpus, state: st, scenes: ['morning'], level: 'A2', now: NOW, rand: () => 0.5 })
    assert.equal(line.id, 'b')
  }
})

test('刚说过 14 天内的句子会被压下去', () => {
  const st = state({ recent: [{ id: 'b', at: NOW - DAY }] })
  const line = pickLine({ corpus, state: st, scenes: ['morning'], level: 'A2', now: NOW, rand: () => 0.5 })
  assert.equal(line.id, 'a')
})

test('播出后 seen 加一；点词后间隔打回 1 天', () => {
  const st = state()
  noteSaid(st, corpus[1], NOW)
  assert.equal(st.words['目'].seen, 1)
  assert.equal(st.words['疲れる'].seen, 1)

  st.words['疲れる'].interval = 7
  noteWordClick(st, '疲れる', NOW)
  assert.equal(st.words['疲れる'].interval, 1)
  assert.equal(st.words['疲れる'].clicked, 1)
})

test('没有辞书形时用词面', () => {
  assert.equal(lemmaOf({ w: '目' }), '目')
  assert.equal(lemmaOf({ w: '疲れた', lemma: '疲れる' }), '疲れる')
})
