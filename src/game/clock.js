// Round the Clock engine. Target starts at 1 and advances to 20 on a hit.
// Finishing 20 requires a double, matching common home-play rules.

export function createClockMatchState(playerIds) {
  const targets = {}
  const finished = {}
  playerIds.forEach((id) => { targets[id] = 1; finished[id] = false })
  return {
    playerIds,
    targets,
    finished,
    completedOrder: [],
    currentPlayerIndex: 0,
    turnDartsThrown: 0,
  }
}

// outcome: 'hit' | 'miss'  (for target 20, a plain/treble hit on 20 that
// is NOT a double counts as a miss for advancement purposes — you still
// need the double to clear it)
export function applyClockThrow(state, outcome) {
  const playerId = state.playerIds[state.currentPlayerIndex]
  const target = state.targets[playerId]
  const hit = outcome === 'hit'

  const nextTargets = { ...state.targets }
  const nextFinished = { ...state.finished }

  if (hit) {
    if (target >= 20) {
      nextFinished[playerId] = true
    } else {
      nextTargets[playerId] = target + 1
    }
  }

  let turnDartsThrown = state.turnDartsThrown + 1
  let nextPlayerIndex = state.currentPlayerIndex

  const justFinished = nextFinished[playerId] && !state.finished[playerId]
  const completedOrder = justFinished ? [...state.completedOrder, playerId] : state.completedOrder

  if (turnDartsThrown >= 3 || justFinished) {
    turnDartsThrown = 0
    // advance to next player who hasn't finished yet
    let idx = state.currentPlayerIndex
    for (let i = 0; i < state.playerIds.length; i++) {
      idx = (idx + 1) % state.playerIds.length
      if (!nextFinished[state.playerIds[idx]]) break
    }
    nextPlayerIndex = idx
  }

  return {
    state: {
      ...state,
      targets: nextTargets,
      finished: nextFinished,
      completedOrder,
      currentPlayerIndex: nextPlayerIndex,
      turnDartsThrown,
    },
    playerId,
    target,
    hit,
    justFinished,
  }
}

export function allFinished(state) {
  return state.playerIds.every((id) => state.finished[id])
}
