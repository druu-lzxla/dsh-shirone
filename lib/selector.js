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

  // 等级是「内容的天花板」，不是「句子的地板」：
  // 语料最高只有 B1 时，B2 用户实际按 B1 选；A2 的寒暄句永远保留一条缝。
  const targetRank = effectiveRank(corpus, level)
  const due = dueLemmas(state, now)

  const recentAt = new Map((state.recent || []).map((r) => [r.id, r.at]))
  const seenToday = new Set(
    Object.entries(state.words || {})
      .filter(([, rec]) => now - (rec.lastSeen ?? 0) < DAY)
      .map(([lemma]) => lemma),
  )
  const daysSince = (id) => (recentAt.has(id) ? (now - recentAt.get(id)) / DAY : Infinity)

  // 三个桶：同级 / 低一级 / 高一级。按固定配比抽桶，再在桶里挑句子。
  // 这样"B2 用户还会听到おかえり"是配额保证的，不靠打分碰运气。
  const buckets = { below: [], at: [], above: [] }
  for (const line of corpus) {
    const rank = RANK[line.level] ?? RANK.A2
    if (rank > targetRank + 1) continue
    const lineScenes = line.scene || []
    if (!scenes.some((s) => lineScenes.includes(s))) continue
    if (rank < targetRank) buckets.below.push(line)
    else if (rank === targetRank) buckets.at.push(line)
    else buckets.above.push(line)
  }

  const keys = ['at', 'below', 'above'].filter((k) => buckets[k].length > 0)
  if (keys.length === 0) return null

  // 同级 62% / 低一级 26%（复习 + 寒暄）/ 高一级 12%（i+1）
  const baseProb = { at: 0.62, below: 0.26, above: 0.12 }
  const total = keys.reduce((sum, k) => sum + baseProb[k], 0)
  let roll = rand() * total
  let bucket = keys[keys.length - 1]
  for (const k of keys) {
    roll -= baseProb[k]
    if (roll <= 0) {
      bucket = k
      break
    }
  }

  const pool = buckets[bucket]

  // 14 天内说过几次：说过越多次越难再被选中
  const saidCount = new Map()
  for (const r of state.recent || []) {
    if (now - r.at < 14 * DAY) saidCount.set(r.id, (saidCount.get(r.id) || 0) + 1)
  }

  let best = null
  let bestScore = -Infinity

  for (const line of pool) {
    let score = 0.5
    let dueHits = 0
    let weakHits = 0

    for (const word of line.words || []) {
      const lemma = lemmaOf(word)
      const rec = state.words?.[lemma]
      if (due.has(lemma)) dueHits += 1
      else if (rec && (rec.clicked ?? 0) > 0) weakHits += 1
    }

    // 到期词封顶，避免一句堆三个词就把别的全挤掉
    score += Math.min(3, dueHits) * 1.5 + Math.min(2, weakHits)
    score += rand() * 0.3
    if ((line.words || []).some((w) => seenToday.has(lemmaOf(w)))) score -= 1

    // 越久没说过越贵；14 天内每说过一次就再打一次折
    const age = daysSince(line.id)
    score *= Math.min(1, 0.12 + age / 10)
    score /= 1 + (saidCount.get(line.id) || 0)

    if (score > bestScore) {
      bestScore = score
      best = line
    }
  }

  return best
}

/** 语料实际能到的最高等级：用户设 B2 但只有 B1 语料时，按 B1 选。 */
export function effectiveRank(corpus, level) {
  const want = RANK[level] ?? RANK.A2
  let max = 0
  for (const line of corpus) max = Math.max(max, RANK[line.level] ?? 0)
  return max ? Math.min(want, max) : want
}

/** 寒暄句：等级 A2、场景是见面/回家/夜里，且没什么学习词——不参与难度淘汰。 */
export function isPhatic(line) {
  const words = line.words || []
  if (words.length === 0) return true
  return line.level === 'A2' && ['morning', 'return', 'night'].includes((line.scene || [])[0])
}

/** 播出后记账：见过的词 seen++；到期的词按 ease 拉长复习间隔。 */
export function noteSaid(state, line, now) {
  for (const word of line.words || []) {
    const lemma = lemmaOf(word)
    const rec = state.words[lemma] || { seen: 0, clicked: 0, lastSeen: 0, interval: 1, ease: 2 }
    const interval = rec.interval ?? 1
    const wasDue = rec.seen > 0 && now >= (rec.lastSeen ?? 0) + interval * DAY
    if (wasDue) {
      rec.interval = Math.min(60, Math.max(2, Math.round(interval * (rec.ease ?? 2))))
      rec.ease = Math.min(3, (rec.ease ?? 2) + 0.05)
    }
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
