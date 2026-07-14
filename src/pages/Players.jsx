import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportAllData, importAllData } from '../db.js'

export default function Players() {
  const players = useLiveQuery(() => db.players.orderBy('name').toArray(), [])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function addPlayer(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await db.players.add({ name: trimmed, createdAt: Date.now() })
    setName('')
  }

  async function removePlayer(id) {
    if (!confirm('Remove this player? Their past matches stay in history.')) return
    await db.players.delete(id)
  }

  async function doExport() {
    const data = await exportAllData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `darts-backup-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function doImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      if (!confirm('This replaces all data currently on this device with the backup file. Continue?')) return
      await importAllData(payload)
      alert('Backup restored.')
    } catch (err) {
      alert('Could not import that file: ' + err.message)
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <Link className="back-link" to="/">←</Link>
        <h1>Players</h1>
      </div>

      <form className="btn-row" onSubmit={addPlayer}>
        <input
          type="text"
          placeholder="Player name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" type="submit">Add</button>
      </form>

      <div className="player-list">
        {(players || []).map((p) => (
          <div className="player-row" key={p.id}>
            <span>{p.name}</span>
            <button className="btn btn-sm btn-outline" onClick={() => removePlayer(p.id)}>Remove</button>
          </div>
        ))}
        {players && players.length === 0 && (
          <div className="empty-state">Add at least one player to start scoring.</div>
        )}
      </div>

      <div className="card stack">
        <strong>Backup</strong>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Everything is stored only on this device. Export a backup now and again,
          or before switching phones, so your stats history isn't lost.
        </p>
        <button className="btn btn-outline" onClick={doExport}>Export backup (.json)</button>
        <label className="btn btn-outline" style={{ textAlign: 'center' }}>
          {busy ? 'Importing…' : 'Import backup (.json)'}
          <input type="file" accept="application/json" onChange={doImport} style={{ display: 'none' }} disabled={busy} />
        </label>
      </div>
    </div>
  )
}
