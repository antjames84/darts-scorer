import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { applyClockThrow, allFinished, createClockMatchState, targetLabel } from '../game/clock.js'
import {
  computeNumberStats,
  weakestNumbers,
  personalBestClock,
  clockAttemptsForPlayer,
  computeStreaks,
} from '../game/stats.js'
import Scoreboard from '../components/Scoreboard.jsx'
import Celebration from '../components/Celebration.jsx'
import { useWakeLock } from '../hooks/useWakeLock.js'

function buzz(pattern) {
  // No-op wherever the Vibration API isn't supported — notably iOS Safari,
  // which has never implemented it, PWA or not. Harmless either way.
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern)
}

function speak(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1
  window.speechSynthesis.speak(utterance)
}

// Position on the 1→20→bull ladder as a plain step count (0-20), so
// "ahead/behind" can be a clean number of numbers rather than comparing
// raw target values, where the bull (25) would otherwise look like a
// jump of 5 instead of the single step it actually is.
function stepFor(target) {
  return target <= 20 ? target - 1 : 20
}

export default function PlayClock() {
  const { matchId } = useParams()
  const id = Number(matchId)
  const [celebration, setCelebration] = useState(null)
  const [voiceOn, setVoiceOn] = useState(true)
  const navigate = useNavigate()
  useWakeLock(true)

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
  const committedClockMatchIds = new Set((allClockMatches || []).map((m) => m.id))

  // Deletes this match outright, no summary screen, nothing saved. For
  // when you're too far from the board to carry on and just want it gone,
  // as opposed to End Session, which still lets you review and decide.
  async function abandonMatch() {
    if (matchFinished) return
    if (!window.confirm('Abandon this game? It\'ll be deleted completely, nothing added to history or stats.')) return
    await db.transaction('rw', db.matches, db.throws, async () => {
      await db.throws.where('matchId').equals(id).delete()
      await db.matches.delete(id)
    })
    navigate('/')
  }

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

    // Speak and buzz immediately, synchronously, off the tap itself —
    // iOS Safari requires speechSynthesis.speak() to fire within the same
    // gesture as the tap that triggered it. Anything awaited beforehand
    // (like the database write below) can silently break that and the
    // announcement just won't play, no error, no warning.
    if (result.hit) buzz(result.justFinished ? [40, 60, 40, 60, 120] : 25)

    if (voiceOn && result.hit && !result.justFinished && ghostThrows) {
      const newDartsCount = currentPlayerThrows.length + 1
      const newTarget = result.state.targets[result.playerId]
      const ghostTargetNow = ghostTargetAt(newDartsCount)
      const diff = stepFor(newTarget) - stepFor(ghostTargetNow)
      if (diff > 0) speak(`${diff} ahead of your best`)
      else if (diff < 0) speak(`${Math.abs(diff)} behind your best`)
      else speak('level with your best')
    }

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

        {!endedEarly && match.winnerPlayerId && state.playerIds.length > 1 && (
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
          const sessionStreaks = computeStreaks(sessionThrows)
          const allTimeThrowsForPlayer = allThrows
            ? allThrows.filter(
                (t) => t.mode === 'clock' && t.playerId === p.id && committedClockMatchIds.has(t.matchId),
              )
            : []
          const allTimeStats = computeNumberStats(allTimeThrowsForPlayer)
          const allTimeStreaks = computeStreaks(allTimeThrowsForPlayer)
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

              {darts > 0 && (
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Longest streak: {sessionStreaks.longestHit} hit{sessionStreaks.longestHit !== 1 ? 's' : ''} in a row
                  {allTimeStreaks.longestHit > sessionStreaks.longestHit ? ` (all-time best: ${allTimeStreaks.longestHit})` : ''}
                  {' · '}
                  {sessionStreaks.longestMiss} miss{sessionStreaks.longestMiss !== 1 ? 'es' : ''} in a row
                </span>
              )}

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
  const liveStreak = computeStreaks(currentPlayerThrows)

  const allTimeThrowsForCurrentPlayer = allThrows
    ? allThrows.filter(
        (t) => t.mode === 'clock' && t.playerId === currentPlayerId && committedClockMatchIds.has(t.matchId),
      )
    : []
  const bestEverStreak = computeStreaks(allTimeThrowsForCurrentPlayer).longestHit

  // Ghost: the ordered hit/miss sequence from this player's personal-best
  // (fewest darts) completed attempt, so live play can be compared
  // against it dart-for-dart rather than only after the fact.
  let ghostThrows = null
  let ghostBestDarts = null
  if (allClockMatches && allThrows) {
    const attempts = clockAttemptsForPlayer(allClockMatches, allThrows, currentPlayerId)
    if (attempts.length > 0) {
      const best = attempts.reduce((a, b) => (b.darts < a.darts ? b : a))
      if (best.matchId !== id) {
        ghostThrows = allThrows
          .filter((t) => t.matchId === best.matchId && t.playerId === currentPlayerId)
          .sort((a, b) => a.id - b.id)
        ghostBestDarts = best.darts
      }
    }
  }

  function ghostTargetAt(dartsSoFar) {
    if (!ghostThrows) return null
    const hits = ghostThrows.slice(0, dartsSoFar).filter((t) => t.hit).length
    return hits >= 20 ? 25 : hits + 1
  }

  const ghostTarget = ghostThrows ? ghostTargetAt(currentPlayerThrows.length) : null

  return (
    <div className="page">
      <div className="topbar" style={{ alignItems: 'center' }}>
        <Link className="back-link" to="/">←</Link>
        <h1 style={{ flex: 1 }}>Round the Clock</h1>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setVoiceOn((v) => !v)}
          style={{ padding: '4px 10px' }}
          aria-label={voiceOn ? 'Mute ghost announcements' : 'Unmute ghost announcements'}
        >
          {voiceOn ? '🔊' : '🔇'}
        </button>
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
        <div className="value" style={{ fontSize: 140, lineHeight: 1 }}>{targetLabel(currentTarget)}</div>
        <div className="label">{players.find((p) => p.id === currentPlayerId)?.name} aiming for {targetLabel(currentTarget)}</div>
        {currentTarget === 25 && match.bullMode === 'strict' && (
          <div className="label" style={{ color: 'var(--muted)' }}>Only the inner bull clears it this game</div>
        )}
        {tally.attempts > 0 && (
          <div className="label" style={{ marginTop: 4 }}>
            {tally.hits}/{tally.attempts} · {tally.pct}%
          </div>
        )}
        {liveStreak.trailingHit >= 2 && (
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: 'var(--accent, #e6533c)' }}>
            🔥 {liveStreak.trailingHit} in a row
            {bestEverStreak > 0 && (
              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>
                {' '}
                {liveStreak.trailingHit > bestEverStreak ? '— new best!' : `(best: ${bestEverStreak})`}
              </span>
            )}
          </div>
        )}
      </div>

      {ghostThrows && (
        <div className="card" style={{ textAlign: 'center', padding: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Personal best: <strong style={{ color: 'inherit' }}>{ghostBestDarts} darts</strong>
          </div>
          <div style={{ marginTop: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>At this point in that game: </span>
            <strong>{targetLabel(ghostTarget)}</strong>
            {' — '}
            {currentTarget > ghostTarget && <span style={{ color: '#2e7d32', fontWeight: 700 }}>ahead of your best</span>}
            {currentTarget === ghostTarget && <span style={{ color: 'var(--muted)' }}>level with your best</span>}
            {currentTarget < ghostTarget && <span style={{ color: 'var(--muted)' }}>behind your best pace</span>}
          </div>
        </div>
      )}

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

      {currentTarget === 25 && match.bullMode === 'strict' ? (
        <div className="btn-row" style={{ gap: 10 }}>
          <button
            onClick={() => record('miss')}
            style={{ flex: 1, minHeight: 100, borderRadius: 14, fontSize: 18, fontWeight: 700, background: 'var(--card, #1c2530)', color: 'inherit', border: 'none' }}
          >
            25 (outer)
          </button>
          <button
            onClick={() => record('hit')}
            style={{ flex: 1, minHeight: 100, borderRadius: 14, fontSize: 18, fontWeight: 700, background: '#2e7d32', color: '#fff', border: 'none' }}
          >
            Bull (50)
          </button>
          <button
            onClick={() => record('miss')}
            style={{ flex: 1, minHeight: 100, borderRadius: 14, fontSize: 18, fontWeight: 700, background: '#c0392b', color: '#fff', border: 'none' }}
          >
            Miss
          </button>
        </div>
      ) : (
        <div className="btn-row" style={{ gap: 10 }}>
          <button
            onClick={() => record('hit')}
            style={{ flex: 1, minHeight: 150, borderRadius: 16, fontSize: 26, fontWeight: 800, background: '#2e7d32', color: '#fff', border: 'none' }}
          >
            Hit
          </button>
          <button
            onClick={() => record('miss')}
            style={{ flex: 1, minHeight: 150, borderRadius: 16, fontSize: 26, fontWeight: 800, background: '#c0392b', color: '#fff', border: 'none' }}
          >
            Miss
          </button>
        </div>
      )}

      <div className="btn-row" style={{ gap: 8, marginTop: 4 }}>
        <button className="btn btn-outline btn-sm" onClick={undo}>Undo last dart</button>
        <button className="btn btn-outline btn-sm" onClick={endSessionEarly}>End session</button>
        <button className="btn btn-outline btn-sm" onClick={abandonMatch}>Abandon</button>
      </div>

      {celebration && <Celebration message={celebration} onDone={() => setCelebration(null)} />}
    </div>
  )
}
