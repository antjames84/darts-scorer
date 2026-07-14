import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { createLeg, legsToWin } from '../game/countdown.js'

export default function NewCountdown() {
  const players = useLiveQuery(() => db.players.orderBy('name').toArray(), [])
  const [mode, setMode] = useState('501')
  const [format, setFormat] = useState('single')
  const [selected, setSelected] = useState([])
  const navigate = useNavigate()

  function toggle(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function start() {
    if (selected.length === 0) return
    const startScore = mode === '501' ? 501 : 301
    const matchId = await db.matches.add({
      mode,
      format,
      status: 'active',
      createdAt: Date.now(),
      finishedAt: null,
    })
    const leg = createLeg(selected, startScore, 0)
    await db.legs.add({
      matchId,
      legNumber: 1,
      startingPlayerIndex: 0,
      legState: leg,
      status: 'active',
      createdAt: Date.now(),
      finishedAt: null,
    })
    navigate(`/play/countdown/${matchId}`)
  }

  return (
    <div className="page">
      <div className="topbar">
        <Link className="back-link" to="/">←</Link>
        <h1>New 501 / 301</h1>
      </div>

      <div className="stack">
        <label className="field">
          Game
          <div className="segmented">
            <button className={mode === '501' ? 'active' : ''} onClick={() => setMode('501')}>501</button>
            <button className={mode === '301' ? 'active' : ''} onClick={() => setMode('301')}>301</button>
          </div>
        </label>

        <label className="field">
          Format
          <div className="segmented">
            <button className={format === 'single' ? 'active' : ''} onClick={() => setFormat('single')}>Single leg</button>
            <button className={format === 'bo3' ? 'active' : ''} onClick={() => setFormat('bo3')}>Best of 3</button>
            <button className={format === 'bo5' ? 'active' : ''} onClick={() => setFormat('bo5')}>Best of 5</button>
          </div>
          <span style={{ color: 'var(--muted)' }}>First to {legsToWin(format)} leg{legsToWin(format) > 1 ? 's' : ''}</span>
        </label>

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
      </div>

      <button className="btn btn-primary" disabled={selected.length === 0} onClick={start}>
        Start match
      </button>
    </div>
  )
}
