import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'

function playerNames(players, ids) {
  return ids.map((id) => players.find((p) => p.id === id)?.name || '?').join(', ')
}

export default function History() {
  const matches = useLiveQuery(() => db.matches.orderBy('createdAt').reverse().toArray(), [])
  const players = useLiveQuery(() => db.players.toArray(), [])

  async function deleteMatch(id) {
    if (!window.confirm('Delete this match? This can\'t be undone.')) return
    await db.transaction('rw', db.matches, db.legs, db.throws, async () => {
      await db.legs.where('matchId').equals(id).delete()
      await db.throws.where('matchId').equals(id).delete()
      await db.matches.delete(id)
    })
  }

  if (!matches || !players) return <div className="page">Loading…</div>

  return (
    <div className="page">
      <div className="topbar">
        <Link className="back-link" to="/">←</Link>
        <h1>Match history</h1>
      </div>

      {matches.length === 0 && <div className="empty-state">No matches played yet.</div>}

      <div className="stack">
        {matches.map((m) => {
          const ids = m.mode === 'clock' ? m.matchState?.playerIds : []
          return (
            <div key={m.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{m.mode === 'clock' ? 'Round the Clock' : `${m.mode} · ${m.format}`}</strong>
                <span className="badge">{m.status}</span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>
                {new Date(m.createdAt).toLocaleString()}
                {m.mode === 'clock' && ids?.length ? ` · ${playerNames(players, ids)}` : ''}
              </div>
              <div className="btn-row" style={{ marginTop: 10 }}>
                {m.status === 'active' ? (
                  <Link
                    className="btn btn-primary btn-sm"
                    to={`/play/${m.mode === 'clock' ? 'clock' : 'countdown'}/${m.id}`}
                  >
                    Resume
                  </Link>
                ) : (
                  <Link className="btn btn-outline btn-sm" to={`/history/${m.id}`}>View</Link>
                )}
                <button className="btn btn-outline btn-sm" onClick={() => deleteMatch(m.id)}>Delete</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
