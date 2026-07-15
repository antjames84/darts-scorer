import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { createClockMatchState } from '../game/clock.js'

export default function NewClock() {
  const players = useLiveQuery(() => db.players.orderBy('name').toArray(), [])
  const [selected, setSelected] = useState([])
  const navigate = useNavigate()

  function toggle(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function start() {
    if (selected.length === 0) return
    const matchState = createClockMatchState(selected)
    const matchId = await db.matches.add({
      mode: 'clock',
      format: null,
      matchState,
      status: 'active',
      committed: false,
      createdAt: Date.now(),
      finishedAt: null,
    })
    navigate(`/play/clock/${matchId}`)
  }

  return (
    <div className="page">
      <div className="topbar">
        <Link className="back-link" to="/">←</Link>
        <h1>Round the Clock</h1>
      </div>

      <p style={{ color: 'var(--muted)', margin: 0 }}>
        Start on 1, work round to 20, then finish on the bull. Any player order can
        play solo for practice or take turns to race each other.
      </p>

      <label className="field">
        Players (tap to select, in throwing order)
        <div className="player-list">
          {(players || []).map((p) => (
            <div
              key={p.id}
              className={`player-row ${selected.includes(p.id) ? 'active' : ''}`}
              onClick={() => toggle(p.id)}
            >
              <span>{p.name}</span>
              {selected.includes(p.id) && <span className="badge">#{selected.indexOf(p.id) + 1}</span>}
            </div>
          ))}
        </div>
        {players && players.length === 0 && (
          <span style={{ color: 'var(--muted)' }}>
            No players yet. <Link to="/players">Add some first</Link>.
          </span>
        )}
      </label>

      <button className="btn btn-primary" disabled={selected.length === 0} onClick={start}>
        Start
      </button>
    </div>
  )
}
