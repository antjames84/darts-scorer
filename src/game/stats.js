// Aggregates Round the Clock throw history into per-number accuracy,
// which is what "weakest number" tracking is built from. 501/301 scoring
// doesn't map cleanly onto a single aimed-for number, so it isn't
// included here — see README.

export const NUMBERS = [...Array.from({ length: 20 }, (_, i) => i + 1)]

export function computeNumberStats(clockThrows) {
  // clockThrows: [{ target, hit, createdAt, playerId }]
  const byNumber = {}
  NUMBERS.forEach((n) => { byNumber[n] = { target: n, attempts: 0, hits: 0 } })

  for (const t of clockThrows) {
    const bucket = byNumber[t.target]
    if (!bucket) continue
    bucket.attempts += 1
    if (t.hit) bucket.hits += 1
  }

  return NUMBERS.map((n) => {
    const { attempts, hits } = byNumber[n]
    const rate = attempts > 0 ? hits / attempts : null
    return { target: n, attempts, hits, rate }
  })
}

export function weakestNumbers(stats, minAttempts = 3, limit = 5) {
  return stats
    .filter((s) => s.attempts >= minAttempts)
    .slice()
    .sort((a, b) => a.rate - b.rate)
    .slice(0, limit)
}

// Splits throws into two buckets (recent vs earlier) so a number's trend
// over time can be shown: is it improving or getting worse.
export function recentVsEarlier(clockThrows, recentDays = 30) {
  const cutoff = Date.now() - recentDays * 24 * 60 * 60 * 1000
  const recent = clockThrows.filter((t) => t.createdAt >= cutoff)
  const earlier = clockThrows.filter((t) => t.createdAt < cutoff)
  return {
    recent: computeNumberStats(recent),
    earlier: computeNumberStats(earlier),
  }
}
