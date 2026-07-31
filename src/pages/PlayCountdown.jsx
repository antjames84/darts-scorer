import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { applyTurnScore, createLeg, legsToWin, checkoutSuggestion } from '../game/countdown.js'
import TurnScoreEntry from '../components/TurnScoreEntry.jsx'
import Scoreboard from '../components/Scoreboard.jsx'
import Celebration from '../components/Celebration.jsx'
import { useWakeLock } from '../hooks/useWakeLock.js'
import { threeDartAverage } from '../game/stats.js'

function buzz(pattern) {
  // No-op wherever the Vibration API isn't supported — notably iOS Safari,
  // which has never implemented it, PWA or not. Harmless either way.
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern)
}

function speak(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel() // don't queue up behind anything still talking
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1
  window.speechSynthesis.speak(utterance)
}

export default function PlayCountdown() {
  const { matchId } = useParams()
  const id = Number(matchId)
  const [toast, setToast] = useState(null)
  const [celebration, setCelebration] = useState(null)
  const [voiceOn, setVoiceOn] = useState(true)
  const navigate = useNavigate()
  useWakeLock(true)

  const match = useLiveQuery(() => db.matches.get(id), [id])
  const legs = useLiveQuery(() => db.legs.where('matchId').equals(id).sortBy('legNumber'), [id])
  const activeLeg = legs?.find((l) => l.status === 'active')
  const playerIds = activeLeg?.legState.playerIds || legs?.[0]?.legState.playerIds || []
  const players = useLiveQuery(() => (playerIds.length ? db.players.bulkGet(playerIds) : []), [JSON.stringify(playerIds)])

  const turns = useLiveQuery(
    () => (activeLeg ? db.throws.where('legId').equals(activeLeg.id).sortBy('id') : []),
    [activeLeg?.id],
  )

  // Every turn across the whole match (all legs so far), used only for
  // the running 3-dart average shown in each player's bar.
  const matchTurns = useLiveQuery(() => db.throws.where('matchId').equals(id).toArray(), [id])

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

    // Buzz and speak immediately, synchronously, off the tap itself —
    // iOS Safari requires speechSynthesis.speak() to fire within the same
    // gesture as the tap that triggered it. Anything awaited beforehand
    // (like the database write below) can silently break that and the
    // announcement just won't play, no error, no warning.
    if (result.event === 'bust') {
      buzz(15)
    } else if (result.event === 'checkout') {
      buzz([40, 60, 40, 60, 120])
    } else {
      buzz(15)
    }

    if (voiceOn && result.event !== 'checkout') {
      const nextPlayerId = result.leg.playerIds[result.leg.currentPlayerIndex]
      const nextPlayerName = players.find((p) => p.id === nextPlayerId)?.name
      const nextRemaining = result.leg.scores[nextPlayerId]
      const phrase = players.length > 1 ? `${nextPlayerName} requires ${nextRemaining}` : `${nextRemaining} remaining`
      speak(phrase)
    }

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
      setToast({ text: 'Bust! Visit discarded.', kind: 'bust' })
    } else if (result.event === 'checkout') {
      setCelebration('Checkout! Leg won.')
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

  // Deletes this match entirely, legs and throws included. Nothing is
  // salvaged — this is for "we're not finishing this one", not a pause.
  // Just navigating Home instead leaves the match exactly as it is,
  // resumable later from History, which covers an actual pause already.
  async function cancelMatch() {
    if (!window.confirm('Cancel this match? It will be deleted completely, including any legs already played.')) return
    await db.transaction('rw', db.matches, db.legs, db.throws, async () => {
      await db.throws.where('matchId').equals(id).delete()
      await db.legs.where('matchId').equals(id).delete()
      await db.matches.delete(id)
    })
    navigate('/')
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
      <div className="topbar" style={{ alignItems: 'center' }}>
        <Link className="back-link" to="/">←</Link>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--muted)' }}>
          {match.mode} · {match.format === 'single' ? 'Single leg' : match.format === 'bo3' ? `Bo3 (first to ${need})` : `Bo5 (first to ${need})`}
          {match.format !== 'single' ? ` · Leg ${activeLeg.legNumber}` : ''}
        </span>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setVoiceOn((v) => !v)}
          style={{ padding: '4px 10px' }}
          aria-label={voiceOn ? 'Mute score announcements' : 'Unmute score announcements'}
        >
          {voiceOn ? '🔊' : '🔇'}
        </button>
        <button className="btn btn-outline btn-sm" onClick={cancelMatch}>Cancel</button>
      </div>

      <Scoreboard
        players={players}
        activePlayerId={currentPlayerId}
        statFor={(pid) => `${leg.scores[pid]}${legWins[pid] ? ` · ${legWins[pid]} leg${legWins[pid] > 1 ? 's' : ''}` : ''}`}
        secondaryFor={(pid) => {
          const avg = threeDartAverage((matchTurns || []).filter((t) => t.playerId === pid))
          return avg != null ? `avg ${avg.toFixed(1)}` : null
        }}
      />

      <div className="score-display" style={{ padding: '4px 0' }}>
        <div className="value">{leg.scores[currentPlayerId]}</div>
      </div>

      {(() => {
        const route = checkoutSuggestion(leg.scores[currentPlayerId])
        return route ? (
          <div className="card" style={{ textAlign: 'center', padding: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Checkout: </span>
            <strong style={{ fontSize: 16 }}>{route.join('  →  ')}</strong>
          </div>
        ) : null
      })()}

      {turns && turns.length > 0 && (
        <div className="label" style={{ textAlign: 'center', color: 'var(--muted)' }}>
          Highest visit this leg: {Math.max(...turns.map((t) => t.scoredPoints))}
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
