import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { applyClockThrow, allFinished, createClockMatchState } from '../game/clock.js'
import Scoreboard from '../components/Scoreboard.jsx'

export default function PlayClock() {
  const { matchId } = useParams()
  const id = Number(matchId)
  const [toast, setToast] = useState(null)

  const match = useLiveQuery(() => db.matches.get(id), [id])
  const players = useLiveQuery(
    () => (match ? db.players.bulkGet(match.matchState.playerIds) : []),
    [match && JSON.stringify(match.matchState.playerIds)],
  )

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1200)
    return () => clearTimeout(t)
  }, [toast])

  if (!match || !players) return <div className="page">Loading…</div>

  const state = match.matchState
  const currentPlayerId = state.playerIds[state.currentPlayerIndex]
  const currentTarget = state.targets[currentPlayerId]
  const matchFinished = match.status === 'finished'

  async function record(outcome) {
    if (matchFinished) return
    const result = applyClockThrow(state, outcome)

    await db.transaction('rw', db.matches, db.throws, async () => {
      await db.throws.add({
        matchId: id,
        legId: null,
        playerId: result.playerId,
        mode: 'clock',
        target: result.target,
        hit: result.hit,
        segment: null,
        multiplier: null,
        value: null,
        createdAt: Date.now(),
      })

      const finishedNow = allFinished(result.state)
      await db.matches.update(id, {
        matchState: result.state,
        status: finishedNow ? 'finished' : 'active',
        finishedAt: finishedNow ? Date.now() : null,
        winnerPlayerId: finishedNow ? result.state.completedOrder[0] : null,
      })
    })

    if (result.justFinished) setToast({ text: `${players.find((p) => p.id === result.playerId)?.name} finished!`, kind: 'checkout' })
  }

  async function undo() {
    const throwsForMatch = (await db.throws.where('matchId').equals(id).toArray()).sort((a, b) => a.id - b.id)
    if (throwsForMatch.length === 0) return
    const last = throwsForMatch[throwsForMatch.length - 1]
    const rest = throwsForMatch.slice(0, -1)

    let s = createClockMatchState(state.playerIds)
    rest.forEach((t) => {
      s = applyClockThrow(s, t.hit ? 'hit' : 'miss').state
    })

    await db.transaction('rw', db.matches, db.throws, async () => {
      await db.throws.delete(last.id)
      await db.matches.update(id, { matchState: s, status: 'active', finishedAt: null, winnerPlayerId: null })
    })
  }

  if (matchFinished) {
    const winner = players.find((p) => p.id === match.winnerPlayerId)
    return (
      <div className="page">
        <div className="topbar">
          <Link className="back-link" to="/">←</Link>
          <h1>Round the Clock</h1>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="score-display">
            <div className="value" style={{ fontSize: 32 }}>{winner?.name || 'Winner'} finishes first!</div>
          </div>
        </div>
        <div className="btn-row">
          <Link className="btn btn-outline" to="/">Home</Link>
          <Link className="btn btn-primary" to="/stats">Stats</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topbar">
        <Link className="back-link" to="/">←</Link>
        <h1>Round the Clock</h1>
      </div>

      <Scoreboard
        players={players}
        activePlayerId={currentPlayerId}
        statFor={(pid) => (state.finished[pid] ? 'Finished' : `On ${state.targets[pid]}`)}
      />

      <div className="score-display">
        <div className="value">{currentTarget}</div>
        <div className="label">{players.find((p) => p.id === currentPlayerId)?.name} aiming for {currentTarget}</div>
      </div>

      {currentTarget < 20 ? (
        <div className="btn-row">
          <button className="btn btn-good" onClick={() => record('hit')}>Hit</button>
          <button className="btn btn-primary" onClick={() => record('miss')}>Miss</button>
        </div>
      ) : (
        <div className="stack">
          <button className="btn btn-good" onClick={() => record('hit')}>Double 20 — finish!</button>
          <div className="btn-row">
            <button className="btn btn-outline" onClick={() => record('miss')}>Hit 20, not double</button>
            <button className="btn btn-primary" onClick={() => record('miss')}>Miss</button>
          </div>
        </div>
      )}

      <button className="btn btn-outline" onClick={undo}>Undo last dart</button>

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  )
}
