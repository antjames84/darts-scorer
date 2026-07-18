import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { computeNumberStats, weakestNumbers, computeStreaks } from '../game/stats.js'
import { targetLabel } from '../game/clock.js'

export default function MatchDetail() {
  const { matchId } = useParams()
  const id = Number(matchId)
  const navigate = useNavigate()

  const match = useLiveQuery(() => db.matches.get(id), [id])
  const legs = useLiveQuery(() => (match?.mode !== 'clock' ? db.legs.where('matchId').equals(id).sortBy('legNumber') : []), [id, match])
  const throwsForMatch = useLiveQuery(() => db.throws.where('matchId').equals(id).sortBy('id'), [id])
  const players = useLiveQuery(() => db.players.toArray(), [])

  async function deleteMatch() {
    if (!window.confirm('Delete this match? This can\'t be undone.')) return
    await db.transaction('rw', db.matches, db.legs, db.throws, async () => {
      await db.legs.where('matchId').equals(id).delete()
      await db.throws.where('matchId').equals(id).delete()
      await db.matches.delete(id)
    })
    navigate('/history')
  }

  if (!match || !players) return <div className="page">Loading…</div>

  const nameOf = (pid) => players.find((p) => p.id === pid)?.name || '?'

  return (
    <div className="page">
      <div className="topbar">
        <Link className="back-link" to="/history">←</Link>
        <h1>{match.mode === 'clock' ? 'Round the Clock' : `${match.mode} match`}</h1>
      </div>

      <div className="card">
        <div>Status: <strong>{match.status}</strong></div>
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>{new Date(match.createdAt).toLocaleString()}</div>
        {match.winnerPlayerId && <div style={{ marginTop: 8 }}>Winner: <strong>{nameOf(match.winnerPlayerId)}</strong></div>}
      </div>

      <div className="btn-row">
        {match.status === 'active' && (
          <Link
            className="btn btn-primary"
            to={`/play/${match.mode === 'clock' ? 'clock' : 'countdown'}/${id}`}
          >
            Resume
          </Link>
        )}
        <button className="btn btn-outline" onClick={deleteMatch}>Delete match</button>
      </div>

      {match.mode === 'clock' ? (
        <>
          <div className="card">
            <div>Saved to stats: <strong>{match.committed ? 'Yes' : 'No — this was discarded or never confirmed'}</strong></div>
          </div>

          {match.matchState.playerIds.map((pid) => {
            const playerThrows = (throwsForMatch || []).filter((t) => t.playerId === pid)
            const darts = playerThrows.length
            const hits = playerThrows.filter((t) => t.hit).length
            const streaks = computeStreaks(playerThrows)
            const stats = computeNumberStats(playerThrows)
            const weakest = weakestNumbers(stats, 1, 3)

            return (
              <div className="card stack" key={pid}>
                <strong>
                  {nameOf(pid)} — {match.matchState.finished[pid] ? 'Finished' : `On ${targetLabel(match.matchState.targets[pid])}`}
                </strong>
                {darts > 0 && (
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {hits}/{darts} ({Math.round((hits / darts) * 100)}%) · longest streak {streaks.longestHit}
                  </span>
                )}
                {weakest.length > 0 && (
                  <div className="stack" style={{ marginTop: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>Weakest this match:</span>
                    {weakest.map((s) => (
                      <div className="stat-row" key={s.target}>
                        <span className="num">{targetLabel(s.target)}</span>
                        <span className="pct">{s.hits}/{s.attempts} ({Math.round(s.rate * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </>
      ) : (
        <div className="stack">
          {(legs || []).map((leg) => (
            <div className="card" key={leg.id}>
              <strong>Leg {leg.legNumber}</strong>
              <div className="stack" style={{ marginTop: 10 }}>
                {leg.legState.playerIds.map((pid) => (
                  <div className="stat-row" key={pid}>
                    <span style={{ flex: 1 }}>{nameOf(pid)}</span>
                    <span className="pct">{leg.legState.scores[pid]}{leg.winnerPlayerId === pid ? ' (won leg)' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
