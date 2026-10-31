// 预算平滑调度：不掷骰、不分峰谷，只有"剩余预算 ÷ 剩余分钟"。
// 纯函数，喂假时间就能测。

export const MINUTE = 60_000
export const DAY = 86_400_000

export function minutesOf(date) {
  return date.getHours() * 60 + date.getMinutes()
}

export function inWindow(minute, startHour, endHour) {
  const start = startHour * 60
  const end = endHour * 60
  if (start === end) return false
  if (start < end) return minute >= start && minute < end
  return minute >= start || minute < end
}

export function remainingMinutes(minute, endHour) {
  const diff = endHour * 60 - minute
  return diff > 0 ? diff : diff + 1440
}

/**
 * @returns {{speak:boolean, reason:string, p?:number}}
 */
export function shouldSpeak({ cfg, state, now, rand = Math.random }) {
  if (!cfg.enabled) return { speak: false, reason: 'disabled' }
  if (state.pausedUntil > now) return { speak: false, reason: 'paused' }

  const date = new Date(now)
  const minute = minutesOf(date)

  if (inWindow(minute, cfg.quietStart, cfg.quietEnd)) return { speak: false, reason: 'quiet' }
  if (!inWindow(minute, cfg.activeStart, cfg.activeEnd)) return { speak: false, reason: 'inactive' }

  const budget = Math.max(0, Math.floor(cfg.budget * (state.penalty ?? 1)))
  if (state.used >= budget) return { speak: false, reason: 'budget' }
  if (now - state.lastSpeakAt < cfg.minGapMin * MINUTE) return { speak: false, reason: 'gap' }
  if (now - (state.lastTypingAt ?? 0) < 2 * MINUTE) return { speak: false, reason: 'typing' }

  const left = budget - state.used
  const rem = remainingMinutes(minute, cfg.activeEnd)
  if (rem <= 0) return { speak: false, reason: 'end' }

  const p = Math.min(0.5, left / rem)
  return rand() < p ? { speak: true, reason: 'ok', p } : { speak: false, reason: 'dice', p }
}
