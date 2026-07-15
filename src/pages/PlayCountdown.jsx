import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { applyTurnScore, createLeg, legsToWin } from '../game/countdown.js'
import TurnScoreEntry from '../components/TurnScoreEntry.jsx'
import Scoreboard from '../components/Scoreboard.jsx'
import Celebration from '../components/Celebration.jsx'

function buzz(pattern) {
  // No-op wherever the Vibration API isn't supported — notably iOS Safari,
  // which has never implemented it, PWA or not. Harmless either way.
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern)
}

export default function PlayCountdown() {
  const { matchId } = useParams()
  const id = Number(matchId)
  const [toast, setToast] = useState(null)
  const [celebration, setCelebration] = useState(null)

  const match = useLiveQuery(() => db.matches.get(id), [id])
  const legs = useLiveQuery(() => db.legs.where('matchId').equals(id).sortBy('legNumber'), [id])
  const activeLeg = legs?.find((l) => l.status === 'active')
  const playerIds = activeLeg?.legState.playerIds || legs?.[0]?.legState.playerIds || []
  const players = useLiveQuery(() => (playerIds.length ? db.players.bulkGet(playerIds) : []), [JSON.stringify(playerIds)])

  const turns = useLiveQuery(
    () => (activeLeg ? db.throws.where('legId').equals(activeLeg.id).sortBy('id') : []),
    [activeLeg?.id],
  )
  const lastTurn = turns && turns.length ? turns[turns.length - 1] : null

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

  async function handleTurn(score, { dartsUsed, checkoutDouble }) {
    if (!activeLeg || match.status === 'finished') return
    const result = applyTurnScore(activeLeg.legState, score, { dartsUsed, checkoutDouble })

    await db.transaction('rw', db.legs, db.throws, db.matches, async () => {
      await db.throws.add({
        matchId: id,
        legId: activeLeg.id,
        playerId: result.playerId,
        mode: match.mode,
        attemptedScore: score,
        scoredPoints: result.event === 'bust' ? 0 : score,
        dartsUsed,
        isCheckout: result.event === 'checkout',
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

    if (result.event === 'bust') {
      buzz(15)
      setToast({ text: 'Bust! Visit discarded.', kind: 'bust' })
    } else if (result.event === 'checkout') {
      buzz([40, 60, 40, 60, 120])
      setCelebration('Checkout! Leg won.')
    } else {
      buzz(15)
    }
  }

  async function undo() {
    if (!activeLeg) return
    const turnsForLeg = (await db.throws.where('legId').equals(activeLeg.id).toArray()).sort((a, b) => a.id - b.id)
    if (turnsForLeg.length === 0) return
    const last = turnsForLeg[turnsForLeg.length - 1]
    const rest = turnsForLeg.slice(0, -1)

    let legState = createLeg(activeLeg.legState.playerIds, activeLeg.legState.startScore, activeLeg.startingPlayerIndex ?? 0)
    rest.forEach((t) => {
      legState = applyTurnScore(legState, t.attemptedScore, {
        dartsUsed: t.dartsUsed,
        checkoutDouble: t.isCheckout,
      }).leg
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
        {celebration && <Celebration message={celebration} onDone={() => setCelebration(null)} />}
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

      {lastTurn && (
        <div className="label" style={{ textAlign: 'center', color: 'var(--muted)' }}>
          Last visit: {lastTurn.scoredPoints}{lastTurn.scoredPoints !== lastTurn.attemptedScore ? ' (bust)' : ''}
        </div>
      )}

      <TurnScoreEntry remaining={leg.scores[currentPlayerId]} onSubmitTurn={handleTurn} />

      <button className="btn btn-outline" onClick={undo} disabled={!turns || turns.length === 0}>
        Undo last visit
      </button>

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
      {celebration && <Celebration message={celebration} onDone={() => setCelebration(null)} />}
    </div>
  )
}
