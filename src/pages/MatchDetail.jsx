import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'

export default function MatchDetail() {
  const { matchId } = useParams()
  const id = Number(matchId)

  const match = useLiveQuery(() => db.matches.get(id), [id])
  const legs = useLiveQuery(() => (match?.mode !== 'clock' ? db.legs.where('matchId').equals(id).sortBy('legNumber') : []), [id, match])
  const players = useLiveQuery(() => db.players.toArray(), [])

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

      {match.mode === 'clock' ? (
        <div className="card">
          <strong>Final standings</strong>
          <div className="stack" style={{ marginTop: 10 }}>
            {match.matchState.playerIds.map((pid) => (
              <div className="stat-row" key={pid}>
                <span style={{ flex: 1 }}>{nameOf(pid)}</span>
                <span className="pct">{match.matchState.finished[pid] ? 'Finished' : `On ${match.matchState.targets[pid]}`}</span>
              </div>
            ))}
          </div>
        </div>
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
