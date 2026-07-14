import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { applyDart, createLeg, legsToWin } from '../game/countdown.js'
import NumberPad from '../components/NumberPad.jsx'
import Scoreboard from '../components/Scoreboard.jsx'

function dartLabel(t) {
  if (t.segment === 0) return 'Miss'
  if (t.segment === 25) return t.multiplier === 2 ? 'D-Bull' : 'Bull'
  const prefix = t.multiplier === 3 ? 'T' : t.multiplier === 2 ? 'D' : ''
  return `${prefix}${t.segment}`
}

export default function PlayCountdown() {
  const { matchId } = useParams()
  const id = Number(matchId)
  const [toast, setToast] = useState(null)

  const match = useLiveQuery(() => db.matches.get(id), [id])
  const legs = useLiveQuery(() => db.legs.where('matchId').equals(id).sortBy('legNumber'), [id])
  const activeLeg = legs?.find((l) => l.status === 'active')
  const playerIds = activeLeg?.legState.playerIds || legs?.[0]?.legState.playerIds || []
  const players = useLiveQuery(() => (playerIds.length ? db.players.bulkGet(playerIds) : []), [JSON.stringify(playerIds)])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1400)
    return () => clearTimeout(t)
  }, [toast])

  if (!match || !legs || !players) return <div className="page">Loading…</div>

  const legWins = {}
  legs.forEach((l) => {
    if (l.winnerPlayerId) legWins[l.winnerPlayerId] = (legWins[l.winnerPlayerId] || 0) + 1
  })

  async function handleThrow(segment, multiplier) {
    if (!activeLeg || match.status === 'finished') return
    const result = applyDart(activeLeg.legState, segment, multiplier)

    await db.transaction('rw', db.legs, db.throws, db.matches, async () => {
      await db.throws.add({
        matchId: id,
        legId: activeLeg.id,
        playerId: result.playerId,
        mode: match.mode,
        target: null,
        hit: null,
        segment,
        multiplier,
        value: result.value,
        createdAt: Date.now(),
      })

      if (result.leg.finished) {
        await db.legs.update(activeLeg.id, {
          legState: result.leg,
          status: 'finished',
          winnerPlayerId: result.leg.winnerPlayerId,
          finishedAt: Date.now(),
        })

        const allLegs = await db.legs.where('matchId').equals(id).toArray()
        const wins = {}
        allLegs.forEach((l) => {
          if (l.winnerPlayerId) wins[l.winnerPlayerId] = (wins[l.winnerPlayerId] || 0) + 1
        })
        const need = legsToWin(match.format)
        const matchWinnerId = Object.keys(wins).find((pid) => wins[pid] >= need)

        if (matchWinnerId) {
          await db.matches.update(id, {
            status: 'finished',
            finishedAt: Date.now(),
            winnerPlayerId: Number(matchWinnerId),
          })
        } else {
          const nextLegNumber = activeLeg.legNumber + 1
          const startingIndex = nextLegNumber % result.leg.playerIds.length
          const newLeg = createLeg(result.leg.playerIds, activeLeg.legState.startScore, startingIndex)
          await db.legs.add({
            matchId: id,
            legNumber: nextLegNumber,
            startingPlayerIndex: startingIndex,
            legState: newLeg,
            status: 'active',
            createdAt: Date.now(),
            finishedAt: null,
          })
        }
      } else {
        await db.legs.update(activeLeg.id, { legState: result.leg })
      }
    })

    if (result.event === 'bust') setToast({ text: 'Bust!', kind: 'bust' })
    else if (result.event === 'checkout') setToast({ text: 'Checkout! Leg won.', kind: 'checkout' })
  }

  async function undo() {
    if (!activeLeg) return
    const throwsForLeg = (await db.throws.where('legId').equals(activeLeg.id).toArray()).sort((a, b) => a.id - b.id)
    if (throwsForLeg.length === 0) return
    const last = throwsForLeg[throwsForLeg.length - 1]
    const rest = throwsForLeg.slice(0, -1)

    let legState = createLeg(activeLeg.legState.playerIds, activeLeg.legState.startScore, activeLeg.startingPlayerIndex ?? 0)
    rest.forEach((t) => {
      legState = applyDart(legState, t.segment, t.multiplier).leg
    })

    await db.transaction('rw', db.legs, db.throws, async () => {
      await db.throws.delete(last.id)
      await db.legs.update(activeLeg.id, { legState })
    })
  }

  const matchFinished = match.status === 'finished'
  const need = legsToWin(match.format)

  if (matchFinished) {
    const winner = players.find((p) => p.id === match.winnerPlayerId)
    return (
      <div className="page">
        <div className="topbar">
          <Link className="back-link" to="/">←</Link>
          <h1>{match.mode} match</h1>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="score-display">
            <div className="value" style={{ fontSize: 32 }}>{winner?.name || 'Winner'} wins!</div>
            <div className="label">
              {legs.filter((l) => l.status === 'finished').length} legs played
            </div>
          </div>
        </div>
        <div className="btn-row">
          <Link className="btn btn-outline" to="/">Home</Link>
          <Link className="btn btn-primary" to="/stats">Stats</Link>
        </div>
      </div>
    )
  }

  const leg = activeLeg.legState
  const currentPlayerId = leg.playerIds[leg.currentPlayerIndex]

  return (
    <div className="page">
      <div className="topbar">
        <Link className="back-link" to="/">←</Link>
        <h1>{match.mode} · {match.format === 'single' ? 'Single leg' : match.format === 'bo3' ? `Bo3 (first to ${need})` : `Bo5 (first to ${need})`}</h1>
      </div>

      <Scoreboard
        players={players}
        activePlayerId={currentPlayerId}
        statFor={(pid) => `${leg.scores[pid]}${legWins[pid] ? ` · ${legWins[pid]} leg${legWins[pid] > 1 ? 's' : ''}` : ''}`}
      />

      <div className="score-display">
        <div className="value">{leg.scores[currentPlayerId]}</div>
        <div className="label">{players.find((p) => p.id === currentPlayerId)?.name}'s turn · leg {activeLeg.legNumber}</div>
      </div>

      <div className="turn-darts">
        {[0, 1, 2].map((i) => (
          <div className="dart" key={i}>{leg.turnDarts[i] ? dartLabel(leg.turnDarts[i]) : ''}</div>
        ))}
      </div>

      <NumberPad onThrow={handleThrow} />

      <button className="btn btn-outline" onClick={undo}>Undo last dart</button>

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  )
}
