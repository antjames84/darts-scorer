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

// --- 501/301 stats, built from turn-based visit history (db.throws rows
// where mode is '501' or '301', written by the new TurnScoreEntry flow).
// Each row is expected to have: playerId, scoredPoints, dartsUsed.

// Three-dart average: total points actually scored divided by total darts
// thrown, scaled to a 3-dart visit, the same definition used in televised
// darts. Bust visits contribute 0 scored points but their darts still
// count towards the denominator, since they were still thrown.
export function threeDartAverage(countdownTurns) {
  let totalScored = 0
  let totalDarts = 0
  countdownTurns.forEach((t) => {
    totalScored += t.scoredPoints || 0
    totalDarts += t.dartsUsed || 0
  })
  if (totalDarts === 0) return null
  return (totalScored / totalDarts) * 3
}

// Head-to-head record between two players across finished 501/301 matches.
// matches: rows from db.matches (status/winnerPlayerId).
// firstLegsByMatchId: { [matchId]: legRow } — the legNumber===1 leg for
//   each match, since that's where the two participants' playerIds live.
export function headToHead(matches, firstLegsByMatchId, playerAId, playerBId) {
  let played = 0
  let aWins = 0
  let bWins = 0

  matches.forEach((m) => {
    if (m.status !== 'finished') return
    const firstLeg = firstLegsByMatchId[m.id]
    if (!firstLeg) return
    const ids = firstLeg.legState.playerIds
    if (ids.length !== 2) return // head-to-head only means something 1v1
    if (!ids.includes(playerAId) || !ids.includes(playerBId)) return

    played += 1
    if (m.winnerPlayerId === playerAId) aWins += 1
    else if (m.winnerPlayerId === playerBId) bWins += 1
  })

  return { played, aWins, bWins }
}
