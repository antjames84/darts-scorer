import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { applyClockThrow, allFinished, createClockMatchState, targetLabel } from '../game/clock.js'
import {
  computeNumberStats,
  weakestNumbers,
  personalBestClock,
} from '../game/stats.js'
import Scoreboard from '../components/Scoreboard.jsx'
import Celebration from '../components/Celebration.jsx'

function buzz(pattern) {
  // No-op wherever the Vibration API isn't supported — notably iOS Safari,
  // which has never implemented it, PWA or not. Harmless either way.
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern)
}

export default function PlayClock() {
  const { matchId } = useParams()
  const id = Number(matchId)
  const [celebration, setCelebration] = useState(null)
  const navigate = useNavigate()

  const match = useLiveQuery(() => db.matches.get(id), [id])
  const players = useLiveQuery(
    () => (match ? db.players.bulkGet(match.matchState.playerIds) : []),
    [match && JSON.stringify(match.matchState.playerIds)],
  )

  // This match's throws, live, used for the turn-confirmation chips and
  // the running tally.
  const throwsForMatch = useLiveQuery(
    () => db.throws.where('matchId').equals(id).sortBy('id'),
    [id],
  )

  // Only *committed* clock matches count as history for personal bests and
  // all-time weakest-number rates — a session sitting on the finish screen
  // uncommitted, or one you discard, never touches these numbers.
  const allClockMatches = useLiveQuery(
    () => db.matches.toArray().then((rows) => rows.filter((m) => m.mode === 'clock' && m.committed)),
    [],
  )
  const allThrows = useLiveQuery(() => db.throws.toArray(), [])

  if (!match || !players || !throwsForMatch) return <div className="page">Loading…</div>

  const state = match.matchState
  const currentPlayerId = state.playerIds[state.currentPlayerIndex]
  const currentTarget = state.targets[currentPlayerId]
  const matchFinished = match.status === 'finished'

  function tallyFor(pid) {
    const rows = throwsForMatch.filter((t) => t.playerId === pid)
    const hits = rows.filter((t) => t.hit).length
    const attempts = rows.length
    const pct = attempts > 0 ? Math.round((hits / attempts) * 100) : null
    return { hits, attempts, pct }
  }

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

    if (result.hit) buzz(result.justFinished ? [40, 60, 40, 60, 120] : 25)

    if (result.justFinished) {
      setCelebration(`${players.find((p) => p.id === result.playerId)?.name} finished!`)
    }
  }

  async function undo() {
    const rows = (await db.throws.where('matchId').equals(id).toArray()).sort((a, b) => a.id - b.id)
    if (rows.length === 0) return
    const last = rows[rows.length - 1]
    const rest = rows.slice(0, -1)

    let s = createClockMatchState(state.playerIds)
    rest.forEach((t) => {
      s = applyClockThrow(s, t.hit ? 'hit' : 'miss').state
    })

    await db.transaction('rw', db.matches, db.throws, async () => {
      await db.throws.delete(last.id)
      await db.matches.update(id, { matchState: s, status: 'active', finishedAt: null, winnerPlayerId: null })
    })
  }

  // Moves to the finish screen, nothing more. Saving to stats (or not) is
  // a separate, explicit choice made on that screen.
  async function endSessionEarly() {
    if (matchFinished) return
    if (!window.confirm('End this session now? You\'ll get a chance to review it before deciding whether to save it.')) return
    await db.matches.update(id, {
      status: 'finished',
      finishedAt: Date.now(),
      winnerPlayerId: state.completedOrder[0] ?? null,
    })
  }

  // The only thing that makes a session count: this flips it from a draft
  // sitting in the database to part of your real history.
  async function commitSession() {
    await db.matches.update(id, { committed: true })
  }

  // Deletes the match and every throw in it. Nothing is left behind —
  // this is the "that was just testing, forget it happened" button.
  async function discardSession() {
    if (!window.confirm('Discard this session? Every throw in it will be permanently deleted.')) return
    await db.transaction('rw', db.matches, db.throws, async () => {
      await db.throws.where('matchId').equals(id).delete()
      await db.matches.delete(id)
    })
    navigate('/')
  }

  if (matchFinished) {
    const endedEarly = !state.playerIds.every((pid) => state.finished[pid])
    const committedClockMatchIds = new Set((allClockMatches || []).map((m) => m.id))

    return (
      <div className="page">
        <div className="topbar">
          <Link className="back-link" to="/">←</Link>
          <h1>Round the Clock</h1>
        </div>

        {!match.committed ? (
          <div className="card stack">
            <strong>Save this session?</strong>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
              Nothing below counts toward stats, personal bests, or weakest-number
              tracking until you save it. Discard drops it completely, no trace left.
            </p>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={commitSession}>Save to stats</button>
              <button className="btn btn-outline" onClick={discardSession}>Discard</button>
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Saved to stats.</p>
        )}

        {!endedEarly && match.winnerPlayerId && (
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="score-display">
              <div className="value" style={{ fontSize: 28 }}>
                {players.find((p) => p.id === match.winnerPlayerId)?.name} finished first!
              </div>
            </div>
          </div>
        )}
        {endedEarly && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Session ended early — here's how it went.</p>
        )}

        {players.map((p) => {
          const sessionThrows = throwsForMatch.filter((t) => t.playerId === p.id)
          const darts = sessionThrows.length
          const hits = sessionThrows.filter((t) => t.hit).length
          const completed = !!state.finished[p.id]

          let pbLine = null
          if (completed && allClockMatches && allThrows) {
            const priorMatches = allClockMatches.filter((m) => m.id !== id)
            const priorBest = personalBestClock(priorMatches, allThrows, p.id)
            if (!priorBest) {
              pbLine = 'First completed round — that\'s your new personal best.'
            } else if (darts < priorBest.bestDarts) {
              pbLine = `New personal best! ${darts} darts (previous best: ${priorBest.bestDarts}).`
            } else if (darts === priorBest.bestDarts) {
              pbLine = `Matched your personal best of ${darts} darts.`
            } else {
              pbLine = `${darts} darts — your best is still ${priorBest.bestDarts}.`
            }
          }

          const sessionStats = computeNumberStats(sessionThrows)
          const sessionWeakest = weakestNumbers(sessionStats, 1, 3)
          const allTimeStats = allThrows
            ? computeNumberStats(
                allThrows.filter(
                  (t) => t.mode === 'clock' && t.playerId === p.id && committedClockMatchIds.has(t.matchId),
                ),
              )
            : []
          const allTimeByNumber = {}
          allTimeStats.forEach((s) => { allTimeByNumber[s.target] = s })

          return (
            <div className="card stack" key={p.id}>
              <strong>{p.name}{completed ? ' — completed' : darts > 0 ? ' — didn\'t finish' : ' — didn\'t throw'}</strong>

              {darts > 0 && (
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                  {hits}/{darts} this session ({Math.round((hits / darts) * 100)}%)
                </span>
              )}

              {pbLine && <span style={{ fontSize: 13 }}>{pbLine}</span>}

              {sessionWeakest.length > 0 && (
                <div className="stack" style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Weakest this session vs. all-time:</span>
                  {sessionWeakest.map((s) => {
                    const allTime = allTimeByNumber[s.target]
                    const allTimePct = allTime && allTime.rate != null ? Math.round(allTime.rate * 100) : null
                    return (
                      <div className="stat-row" key={s.target}>
                        <span className="num">{targetLabel(s.target)}</span>
                        <span className="pct">
                          {s.hits}/{s.attempts} ({Math.round(s.rate * 100)}%)
                          {allTimePct != null ? ` · all-time ${allTimePct}%` : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        <div className="btn-row">
          <Link className="btn btn-outline" to="/">Home</Link>
          <Link className="btn btn-primary" to="/stats">Stats</Link>
        </div>
      </div>
    )
  }

  const tally = tallyFor(currentPlayerId)
  const currentPlayerThrows = throwsForMatch.filter((t) => t.playerId === currentPlayerId)
  // How many darts belong to the player's current (or just-completed) turn.
  // state.turnDartsThrown resets to 0 the instant a 3rd dart rotates play
  // to the next turn, in the same update that recorded that dart — there's
  // no render in between where it'd show 3. Deriving this from the throw
  // history itself instead means the 3rd box stays visible right up until
  // the next dart is actually thrown, rather than flashing straight to 0.
  const turnBoxCount =
    currentPlayerThrows.length === 0 ? 0 : currentPlayerThrows.length % 3 === 0 ? 3 : currentPlayerThrows.length % 3
  const thisTurnThrows = turnBoxCount === 0 ? [] : currentPlayerThrows.slice(-turnBoxCount)

  return (
    <div className="page">
      <div className="topbar">
        <Link className="back-link" to="/">←</Link>
        <h1>Round the Clock</h1>
      </div>

      <Scoreboard
        players={players}
        activePlayerId={currentPlayerId}
        statFor={(pid) => {
          const t = tallyFor(pid)
          const tallyText = t.attempts > 0 ? ` · ${t.hits}/${t.attempts} (${t.pct}%)` : ''
          return state.finished[pid] ? `Finished${tallyText}` : `On ${targetLabel(state.targets[pid])}${tallyText}`
        }}
      />

      <div className="score-display">
        <div className="value">{targetLabel(currentTarget)}</div>
        <div className="label">{players.find((p) => p.id === currentPlayerId)?.name} aiming for {targetLabel(currentTarget)}</div>
        {tally.attempts > 0 && (
          <div className="label" style={{ marginTop: 4 }}>
            {tally.hits}/{tally.attempts} · {tally.pct}%
          </div>
        )}
      </div>

      <div className="btn-row" style={{ justifyContent: 'center', gap: 8 }}>
        {[0, 1, 2].map((i) => {
          const t = thisTurnThrows[i]
          return (
            <span
              key={i}
              style={{
                minWidth: 56,
                textAlign: 'center',
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                background: t ? (t.hit ? 'var(--good, #2e7d32)' : 'var(--bad, #555)') : 'transparent',
                border: t ? 'none' : '1px dashed var(--muted)',
                color: t ? '#fff' : 'var(--muted)',
              }}
            >
              {t ? (t.hit ? 'Hit' : 'Miss') : '·'}
            </span>
          )
        })}
      </div>

      <div className="btn-row">
        <button className="btn btn-good" onClick={() => record('hit')}>Hit</button>
        <button className="btn btn-primary" onClick={() => record('miss')}>Miss</button>
      </div>

      <button className="btn btn-outline" onClick={undo}>Undo last dart</button>
      <button className="btn btn-outline" onClick={endSessionEarly}>End session</button>

      {celebration && <Celebration message={celebration} onDone={() => setCelebration(null)} />}
    </div>
  )
}
