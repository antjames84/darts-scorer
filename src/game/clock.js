// Round the Clock engine. Target starts at 1, advances through the
// numbers on a hit, then finishes on the bull (target 25 — either ring
// counts, this isn't a double-out game like 501/301).

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

// outcome: 'hit' | 'miss'. Targets run 1-20, then 25 (bull) to finish.
// Any hit on the bull clears it — no double requirement.
export function applyClockThrow(state, outcome) {
  const playerId = state.playerIds[state.currentPlayerIndex]
  const target = state.targets[playerId]
  const hit = outcome === 'hit'

  const nextTargets = { ...state.targets }
  const nextFinished = { ...state.finished }

  if (hit) {
    if (target === 25) {
      nextFinished[playerId] = true
    } else if (target === 20) {
      nextTargets[playerId] = 25
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

// Display label for a target — everywhere else in the app "25" is a
// segment number, but on this screen the player should see "Bull".
export function targetLabel(target) {
  return target === 25 ? 'Bull' : String(target)
}
