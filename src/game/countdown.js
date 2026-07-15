// 501 / 301 game engine. Pure functions, no side effects, so it's easy
// to reason about and test independently of the UI/database.

export function dartValue(segment, multiplier) {
  if (segment === 0 || multiplier === 0) return 0
  if (segment === 25) return multiplier === 2 ? 50 : 25 // bull: single=25, double bull=50
  return segment * multiplier
}

export function legsToWin(format) {
  // format: 'single' | 'bo3' | 'bo5'
  if (format === 'bo3') return 2
  if (format === 'bo5') return 3
  return 1
}

export function createLeg(playerIds, startScore, startingPlayerIndex = 0) {
  const scores = {}
  playerIds.forEach((id) => { scores[id] = startScore })
  return {
    startScore,
    scores,
    playerIds,
    currentPlayerIndex: startingPlayerIndex,
    turnDarts: [], // kept for backwards compatibility with applyDart, unused by turn entry
    turnStartScore: startScore,
    winnerPlayerId: null,
    finished: false,
  }
}

// --- Original per-dart engine. No longer used by the UI (PlayCountdown now
// uses applyTurnScore below) but left in place in case anything else,
// including tests, still imports it. Safe to delete once you've confirmed
// nothing references it. ---
export function applyDart(leg, segment, multiplier) {
  if (leg.finished) return { leg, event: 'finished' }

  const playerId = leg.playerIds[leg.currentPlayerIndex]
  const value = dartValue(segment, multiplier)
  const scoreBefore = leg.scores[playerId]
  const remaining = scoreBefore - value

  const turnDarts = [...leg.turnDarts, { segment, multiplier, value }]

  let event = 'normal'
  let nextScores = leg.scores
  let winnerPlayerId = null
  let finished = false
  let endTurn = false

  if (remaining < 0 || remaining === 1) {
    event = 'bust'
    endTurn = true
    nextScores = { ...leg.scores, [playerId]: leg.turnStartScore }
  } else if (remaining === 0) {
    if (multiplier === 2) {
      event = 'checkout'
      finished = true
      winnerPlayerId = playerId
      nextScores = { ...leg.scores, [playerId]: 0 }
      endTurn = true
    } else {
      event = 'bust'
      endTurn = true
      nextScores = { ...leg.scores, [playerId]: leg.turnStartScore }
    }
  } else {
    nextScores = { ...leg.scores, [playerId]: remaining }
    if (turnDarts.length >= 3) endTurn = true
  }

  let nextPlayerIndex = leg.currentPlayerIndex
  let nextTurnDarts = turnDarts
  let nextTurnStartScore = leg.turnStartScore

  if (!finished && endTurn) {
    nextPlayerIndex = (leg.currentPlayerIndex + 1) % leg.playerIds.length
    nextTurnDarts = []
    nextTurnStartScore = nextScores[leg.playerIds[nextPlayerIndex]]
  }

  return {
    leg: {
      ...leg,
      scores: nextScores,
      currentPlayerIndex: nextPlayerIndex,
      turnDarts: nextTurnDarts,
      turnStartScore: finished ? leg.turnStartScore : nextTurnStartScore,
      winnerPlayerId,
      finished,
    },
    event,
    playerId,
    value,
  }
}

export function remainingAfterTurnSoFar(leg) {
  const playerId = leg.playerIds[leg.currentPlayerIndex]
  return leg.scores[playerId]
}

// --- New turn-based engine. One number per visit instead of one tap per
// dart. This is what PlayCountdown now calls. ---

// Does entering this score bring the current player to exactly zero?
// The UI uses this to decide whether to ask "did you finish on a double".
export function wouldFinish(leg, scoreEntered) {
  const playerId = leg.playerIds[leg.currentPlayerIndex]
  return leg.scores[playerId] - scoreEntered === 0
}

// scoreEntered: total points for the whole visit (0-180).
// options.dartsUsed: how many darts that visit actually took (1-3), only
//   meaningful for the three-dart-average calculation later.
// options.checkoutDouble: true if the player confirmed the last dart of a
//   zero-remaining visit was a double (or double bull). Reaching exactly
//   zero without confirming this is treated as a bust, same as real rules.
export function applyTurnScore(leg, scoreEntered, options = {}) {
  const { dartsUsed = 3, checkoutDouble = false } = options

  if (leg.finished) return { leg, event: 'finished' }
  if (!Number.isFinite(scoreEntered) || scoreEntered < 0 || scoreEntered > 180) {
    throw new Error('A visit score must be between 0 and 180.')
  }

  const playerId = leg.playerIds[leg.currentPlayerIndex]
  const scoreBefore = leg.scores[playerId]
  const remaining = scoreBefore - scoreEntered

  let event = 'normal'
  let nextScores = leg.scores
  let winnerPlayerId = null
  let finished = false

  if (remaining < 0 || remaining === 1) {
    // Bust: nothing is kept, score stays exactly where it was.
    event = 'bust'
  } else if (remaining === 0) {
    if (checkoutDouble) {
      event = 'checkout'
      finished = true
      winnerPlayerId = playerId
      nextScores = { ...leg.scores, [playerId]: 0 }
    } else {
      // Reached zero without a confirmed double out — also a bust.
      event = 'bust'
    }
  } else {
    nextScores = { ...leg.scores, [playerId]: remaining }
  }

  const nextPlayerIndex = finished
    ? leg.currentPlayerIndex
    : (leg.currentPlayerIndex + 1) % leg.playerIds.length

  return {
    leg: {
      ...leg,
      scores: nextScores,
      currentPlayerIndex: nextPlayerIndex,
      winnerPlayerId,
      finished,
    },
    event,
    playerId,
    scoreEntered,
    dartsUsed,
  }
}
