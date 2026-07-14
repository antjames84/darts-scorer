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
    turnDarts: [], // darts thrown so far this turn: {segment, multiplier, value}
    turnStartScore: startScore,
    winnerPlayerId: null,
    finished: false,
  }
}

// Applies a single dart throw to leg state. Returns a NEW leg state plus
// a descriptor of what happened (bust / checkout / normal) for UI feedback.
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
    // Bust: revert to the score at the start of this turn, move on.
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
      // Reached zero without a double out: also a bust.
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
