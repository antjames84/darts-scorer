import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { computeNumberStats, weakestNumbers } from '../game/stats.js'

export default function Stats() {
  const players = useLiveQuery(() => db.players.orderBy('name').toArray(), [])
  const [playerId, setPlayerId] = useState(null)

  const activeId = playerId ?? players?.[0]?.id

  const clockThrows = useLiveQuery(
    () => (activeId ? db.throws.where({ mode: 'clock', playerId: activeId }).toArray() : []),
    [activeId],
  )

  if (!players) return <div className="page">Loading…</div>

  if (players.length === 0) {
    return (
      <div className="page">
        <div className="topbar">
          <Link className="back-link" to="/">←</Link>
          <h1>Stats</h1>
        </div>
        <div className="empty-state">Add a player first.</div>
      </div>
    )
  }

  const stats = clockThrows ? computeNumberStats(clockThrows) : []
  const weakest = weakestNumbers(stats, 3, 5)
  const totalAttempts = stats.reduce((sum, s) => sum + s.attempts, 0)

  return (
    <div className="page">
      <div className="topbar">
        <Link className="back-link" to="/">←</Link>
        <h1>Stats</h1>
      </div>

      <label className="field">
        Player
        <select value={activeId} onChange={(e) => setPlayerId(Number(e.target.value))}>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>

      <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
        Built from Round the Clock sessions, where each dart has a clear target.
        501/301 scoring doesn't map to a single number, so it isn't counted here.
      </p>

      {totalAttempts === 0 ? (
        <div className="empty-state">Play a round of Round the Clock to start building stats.</div>
      ) : (
        <>
          <div className="card">
            <strong>Weakest numbers</strong>
            <div className="stack" style={{ marginTop: 10 }}>
              {weakest.length === 0 && (
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                  Not enough attempts yet on any number (need at least 3).
                </span>
              )}
              {weakest.map((s) => (
                <div className="stat-row" key={s.target}>
                  <span className="num">{s.target}</span>
                  <div className="bar-track">
                    <div className="bar-fill weak" style={{ width: `${Math.round(s.rate * 100)}%` }} />
                  </div>
                  <span className="pct">{s.hits}/{s.attempts} · {Math.round(s.rate * 100)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <strong>All numbers</strong>
            <div className="stack" style={{ marginTop: 10 }}>
              {stats.map((s) => (
                <div className="stat-row" key={s.target}>
                  <span className="num">{s.target}</span>
                  <div className="bar-track">
                    {s.attempts > 0 && (
                      <div className={`bar-fill ${s.rate < 0.5 ? 'weak' : ''}`} style={{ width: `${Math.round(s.rate * 100)}%` }} />
                    )}
                  </div>
                  <span className="pct">{s.attempts > 0 ? `${s.hits}/${s.attempts} · ${Math.round(s.rate * 100)}%` : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
