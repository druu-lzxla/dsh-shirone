// 选句：过滤（等级/场景/刚说过）→ 打分（到期词 > 薄弱词 > 场景）→ 采样。
// 不做向量检索：语料量级用不上。

export const DAY = 86_400_000

const RANK = { A2: 2, B1: 3, B2: 4 }

export function lemmaOf(word) {
  return word.lemma || word.w
}

export function dueLemmas(state, now) {
  const out = new Set()
  for (const [lemma, rec] of Object.entries(state.words || {})) {
    const interval = rec.interval ?? 1
    if (now >= (rec.lastSeen ?? 0) + interval * DAY) out.add(lemma)
  }
  return out
}

export function pickLine({ corpus, state, scenes, level, now, rand = Math.random }) {
  if (!corpus || corpus.length === 0) return null

  const maxRank = RANK[level] ?? RANK.A2
  const due = dueLemmas(state, now)

  const recentAt = new Map((state.recent || []).map((r) => [r.id, r.at]))
  const seenToday = new Set(
    Object.entries(state.words || {})
      .filter(([, rec]) => now - (rec.lastSeen ?? 0) < DAY)
      .map(([lemma]) => lemma),
  )
  const daysSince = (id) => (recentAt.has(id) ? (now - recentAt.get(id)) / DAY : Infinity)

  const base = corpus.filter((line) => {
    if ((RANK[line.level] ?? 0) > maxRank) return false
    const lineScenes = line.scene || []
    return scenes.some((s) => lineScenes.includes(s))
  })
  if (base.length === 0) return null

  // 先硬性避开 14 天内说过的；不够用了退到 7 天；再不够就全放开。
  let pool = base.filter((line) => daysSince(line.id) >= 14)
  if (pool.length < 3) pool = base.filter((line) => daysSince(line.id) >= 7)
  if (pool.length === 0) pool = base

  let best = null
  let bestScore = -Infinity

  for (const line of pool) {
    let score = rand() * 0.3 + 0.5
    let dueHits = 0
    let weakHits = 0

    for (const word of line.words || []) {
      const lemma = lemmaOf(word)
      const rec = state.words?.[lemma]
      if (due.has(lemma)) dueHits += 1
      else if (rec && (rec.clicked ?? 0) > 0) weakHits += 1
    }

    // 封顶：别让一句里堆着三个到期词就把别的句子全挤掉
    score += Math.min(3, dueHits) * 2 + Math.min(2, weakHits)
    if ((line.words || []).some((w) => seenToday.has(lemmaOf(w)))) score -= 1

    if (score > bestScore) {
      bestScore = score
      best = line
    }
  }

  return best
}

/** 播出后记账：见过的词 seen++，到期的词重排。 */
export function noteSaid(state, line, now) {
  for (const word of line.words || []) {
    const lemma = lemmaOf(word)
    const rec = state.words[lemma] || { seen: 0, clicked: 0, lastSeen: 0, interval: 1, ease: 2 }
    rec.seen += 1
    rec.lastSeen = now
    state.words[lemma] = rec
  }
}

/** 点了词 = 不认识：复习间隔打回 1 天，难度下调。 */
export function noteWordClick(state, lemma, now) {
  const rec = state.words[lemma] || { seen: 0, clicked: 0, lastSeen: now, interval: 1, ease: 2 }
  rec.clicked = (rec.clicked ?? 0) + 1
  rec.interval = 1
  rec.ease = Math.max(1.2, (rec.ease ?? 2) - 0.2)
  rec.lastSeen = now
  state.words[lemma] = rec
}

/** 没点、到期了 = 记住了：间隔按 ease 拉长。 */
export function noteRemembered(state, lemma, now) {
  const rec = state.words[lemma]
  if (!rec) return
  const interval = rec.interval ?? 1
  if (now >= (rec.lastSeen ?? 0) + interval * DAY) {
    rec.interval = Math.min(60, Math.round(interval * (rec.ease ?? 2)))
    rec.ease = Math.min(3, (rec.ease ?? 2) + 0.05)
  }
}
