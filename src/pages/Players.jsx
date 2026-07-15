import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportAllData, importAllData } from '../db.js'
import { threeDartAverage, headToHead } from '../game/stats.js'

export default function Players() {
  const players = useLiveQuery(() => db.players.orderBy('name').toArray(), [])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  // Head-to-head + average section. Deliberately uses full-table scans
  // (.toArray()) rather than indexed queries, since the exact indexes on
  // matches/legs/throws weren't available when this was written — for a
  // single-device home app this is a non-issue performance-wise.
  const allMatches = useLiveQuery(() => db.matches.toArray(), [])
  const allLegs = useLiveQuery(() => db.legs.toArray(), [])
  const allThrows = useLiveQuery(() => db.throws.toArray(), [])

  const [pairA, setPairA] = useState('')
  const [pairB, setPairB] = useState('')

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

  function csvEscape(value) {
    const s = value === null || value === undefined ? '' : String(value)
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }

  // One row per throw/visit across both game modes, with player names
  // resolved so you can open this in Excel/Numbers/Sheets and look at
  // it directly rather than parsing the JSON backup. Fields that don't
  // apply to a given mode (e.g. "target" for a 501 visit) are left blank.
  async function doCsvExport() {
    const [playersList, throwsRows] = await Promise.all([
      db.players.toArray(),
      db.throws.toArray(),
    ])

    const playerName = {}
    playersList.forEach((p) => { playerName[p.id] = p.name })

    const headers = [
      'date', 'mode', 'matchId', 'legId', 'player',
      'attemptedScore', 'scoredPoints', 'dartsUsed', 'isCheckout',
      'target', 'hit', 'segment', 'multiplier', 'value',
    ]

    const rows = throwsRows
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((t) => [
        new Date(t.createdAt).toISOString(),
        t.mode ?? '',
        t.matchId ?? '',
        t.legId ?? '',
        playerName[t.playerId] || t.playerId,
        t.attemptedScore ?? '',
        t.scoredPoints ?? '',
        t.dartsUsed ?? '',
        t.isCheckout ?? '',
        t.target ?? '',
        t.hit ?? '',
        t.segment ?? '',
        t.multiplier ?? '',
        t.value ?? '',
      ])

    const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `darts-throws-${stamp}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Wipes every table on this device. Deliberately requires typing a exact
  // word rather than a single OK/Cancel confirm, since there's no undo —
  // this isn't the same as removing one player, it clears everything.
  async function resetAllData() {
    const typed = window.prompt(
      'This permanently deletes every player, match, and stat on this device. There is no undo. Type RESET to confirm.',
    )
    if (typed !== 'RESET') return
    await db.transaction('rw', db.players, db.matches, db.legs, db.throws, async () => {
      await db.throws.clear()
      await db.legs.clear()
      await db.matches.clear()
      await db.players.clear()
    })
    alert('All data cleared.')
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

  const pairAId = pairA ? Number(pairA) : null
  const pairBId = pairB ? Number(pairB) : null

  let h2h = null
  let avgA = null
  let avgB = null

  if (pairAId && pairBId && pairAId !== pairBId && allMatches && allLegs && allThrows) {
    const firstLegsByMatchId = {}
    allLegs.forEach((l) => {
      if (l.legNumber === 1) firstLegsByMatchId[l.matchId] = l
    })
    h2h = headToHead(allMatches, firstLegsByMatchId, pairAId, pairBId)

    const countdownThrows = allThrows.filter((t) => t.mode === '501' || t.mode === '301')
    avgA = threeDartAverage(countdownThrows.filter((t) => t.playerId === pairAId))
    avgB = threeDartAverage(countdownThrows.filter((t) => t.playerId === pairBId))
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

      {players && players.length >= 2 && (
        <div className="card stack">
          <strong>Head-to-head</strong>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
            Built from finished 501/301 matches between exactly two players.
          </p>

          <div className="btn-row">
            <select value={pairA} onChange={(e) => setPairA(e.target.value)}>
              <option value="">Player A</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select value={pairB} onChange={(e) => setPairB(e.target.value)}>
              <option value="">Player B</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {pairAId && pairBId && pairAId === pairBId && (
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>Pick two different players.</span>
          )}

          {h2h && (
            <div className="stack" style={{ marginTop: 4 }}>
              {h2h.played === 0 ? (
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                  No finished 1v1 matches between these two yet.
                </span>
              ) : (
                <>
                  <div className="stat-row">
                    <span>{players.find((p) => p.id === pairAId)?.name}</span>
                    <span className="pct">{h2h.aWins} win{h2h.aWins !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="stat-row">
                    <span>{players.find((p) => p.id === pairBId)?.name}</span>
                    <span className="pct">{h2h.bWins} win{h2h.bWins !== 1 ? 's' : ''}</span>
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>{h2h.played} match{h2h.played !== 1 ? 'es' : ''} played</span>
                  <div className="stat-row">
                    <span>3-dart avg.</span>
                    <span className="pct">
                      {avgA != null ? avgA.toFixed(1) : '—'} vs {avgB != null ? avgB.toFixed(1) : '—'}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card stack">
        <strong>Backup</strong>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Everything is stored only on this device. Export a backup now and again,
          or before switching phones, so your stats history isn't lost.
        </p>
        <button className="btn btn-outline" onClick={doExport}>Export backup (.json)</button>
        <button className="btn btn-outline" onClick={doCsvExport}>Export throws (.csv)</button>
        <label className="btn btn-outline" style={{ textAlign: 'center' }}>
          {busy ? 'Importing…' : 'Import backup (.json)'}
          <input type="file" accept="application/json" onChange={doImport} style={{ display: 'none' }} disabled={busy} />
        </label>
      </div>

      <div className="card stack">
        <strong>Reset</strong>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Deletes every player, match, and stat on this device. There's no undo,
          export a backup first if there's anything worth keeping.
        </p>
        <button className="btn btn-outline" onClick={resetAllData}>Reset all data</button>
      </div>
    </div>
  )
}
