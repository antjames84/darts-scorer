import { useState } from 'react'
import { dartValue } from '../game/countdown.js'

function buzz(pattern) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern)
}

// Per-dart visit entry for 501/301. Single/Double/Treble set the
// multiplier and wait for a number tap; Bull and Outer fire immediately,
// same as Miss, since none of those three need a follow-up number. Only
// the total for the whole visit is ever sent to the game engine via
// onSubmitTurn — countdown.js and PlayCountdown.jsx don't need to change.
export default function TurnScoreEntry({ remaining, onSubmitTurn, disabled }) {
  const [multiplier, setMultiplier] = useState(1)
  const [darts, setDarts] = useState([]) // values already entered this turn, max 3
  const [pendingCheckout, setPendingCheckout] = useState(null) // { total, dartsUsed }

  const total = darts.reduce((sum, d) => sum + d, 0)
  const remainingAfter = remaining - total
  const bustCertain = remainingAfter < 0 || remainingAfter === 1
  const readyToSubmit = darts.length === 3 || bustCertain
  const dartsLeftThisTurn = 3 - darts.length

  function throwDart(segment, mult) {
    if (disabled || readyToSubmit || darts.length >= 3) return
    const value = dartValue(segment, mult)
    buzz(15)

    const nextDarts = [...darts, value]
    const nextTotal = nextDarts.reduce((s, v) => s + v, 0)
    setDarts(nextDarts)
    setMultiplier(1)

    if (remaining - nextTotal === 0) {
      setPendingCheckout({ total: nextTotal, dartsUsed: nextDarts.length })
    }
  }

  function removeLastDart() {
    if (disabled || darts.length === 0) return
    setDarts((prev) => prev.slice(0, -1))
  }

  // Backs out of the checkout prompt without submitting anything, so a
  // wrongly-entered dart can still be fixed even after it triggered the
  // "did you finish on a double" question.
  function backFromCheckout() {
    setPendingCheckout(null)
    setDarts((prev) => prev.slice(0, -1))
  }

  function reset() {
    setDarts([])
    setMultiplier(1)
    setPendingCheckout(null)
  }

  function submitTurn() {
    if (disabled) return
    onSubmitTurn(total, { dartsUsed: darts.length, checkoutDouble: false })
    reset()
  }

  function confirmCheckout() {
    onSubmitTurn(pendingCheckout.total, { dartsUsed: pendingCheckout.dartsUsed, checkoutDouble: true })
    reset()
  }

  function rejectCheckout() {
    onSubmitTurn(pendingCheckout.total, { dartsUsed: pendingCheckout.dartsUsed, checkoutDouble: false })
    reset()
  }

  function modeBtnStyle(active) {
    return {
      flex: 1,
      minHeight: 52,
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 700,
      lineHeight: 1.3,
      background: active ? 'var(--accent, #e6533c)' : 'var(--card, #1c2530)',
      color: active ? '#fff' : 'inherit',
      border: 'none',
      padding: '4px 2px',
      opacity: disabled ? 0.5 : 1,
    }
  }

  const bottomBtnStyle = {
    flex: 1,
    minHeight: 52,
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    background: 'var(--card, #1c2530)',
    color: 'inherit',
    border: 'none',
    opacity: disabled ? 0.5 : 1,
  }

  if (pendingCheckout) {
    return (
      <div className="stack checkout-confirm" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
        <p style={{ margin: 0 }}>That leaves 0 — did you finish on a double?</p>
        <div className="btn-row">
          <button className="btn btn-outline" onClick={rejectCheckout}>No, it's a bust</button>
          <button className="btn btn-primary" onClick={confirmCheckout}>Yes, checkout!</button>
        </div>
        <button className="btn btn-outline btn-sm" onClick={backFromCheckout}>
          ← Wrong dart, let me fix it
        </button>
      </div>
    )
  }

  return (
    <div className="stack" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
      <div className="btn-row" style={{ justifyContent: 'center', gap: 8 }}>
        {[0, 1, 2].map((i) => {
          const filled = darts[i]
          const isActive = i === darts.length && !readyToSubmit
          return (
            <div
              key={i}
              style={{
                minWidth: 64,
                textAlign: 'center',
                padding: '10px 8px',
                borderRadius: 8,
                fontSize: 20,
                fontWeight: 700,
                background: filled !== undefined ? 'var(--card, #1c2530)' : 'transparent',
                border: isActive ? '2px solid var(--accent, #e6533c)' : '1px dashed var(--muted)',
                color: filled !== undefined ? 'inherit' : 'var(--muted)',
              }}
            >
              {filled !== undefined ? filled : '·'}
            </div>
          )
        })}
      </div>

      <div className="label" style={{ textAlign: 'center' }}>
        Total: {total}{bustCertain ? ' — bust' : ''}
      </div>

      {!readyToSubmit && (
        <div className="label" style={{ textAlign: 'center', color: 'var(--muted)' }}>
          {dartsLeftThisTurn} dart{dartsLeftThisTurn !== 1 ? 's' : ''} left this turn
        </div>
      )}

      {!readyToSubmit && (
        <>
          <div className="btn-row" style={{ gap: 6 }}>
            <button onClick={() => setMultiplier(1)} disabled={disabled} style={modeBtnStyle(multiplier === 1)}>Single</button>
            <button onClick={() => setMultiplier(2)} disabled={disabled} style={modeBtnStyle(multiplier === 2)}>Double</button>
            <button onClick={() => setMultiplier(3)} disabled={disabled} style={modeBtnStyle(multiplier === 3)}>Treble</button>
            <button onClick={() => throwDart(25, 2)} disabled={disabled} style={modeBtnStyle(false)}>
              Bull<br /><span style={{ fontWeight: 400, fontSize: 11 }}>50</span>
            </button>
            <button onClick={() => throwDart(25, 1)} disabled={disabled} style={modeBtnStyle(false)}>
              Outer<br /><span style={{ fontWeight: 400, fontSize: 11 }}>25</span>
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 6,
            }}
          >
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => throwDart(n, multiplier)}
                disabled={disabled}
                style={{
                  aspectRatio: '1 / 1',
                  borderRadius: 10,
                  fontSize: 17,
                  fontWeight: 700,
                  background: 'var(--card, #1c2530)',
                  color: 'inherit',
                  border: 'none',
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="btn-row" style={{ gap: 8 }}>
            <button onClick={removeLastDart} disabled={disabled || darts.length === 0} style={bottomBtnStyle}>
              ← Undo
            </button>
            <button onClick={() => throwDart(0, 0)} disabled={disabled} style={bottomBtnStyle}>
              Miss
            </button>
          </div>
        </>
      )}

      {readyToSubmit && darts.length > 0 && (
        <button onClick={removeLastDart} disabled={disabled} style={bottomBtnStyle}>
          ← Undo last dart
        </button>
      )}

      {readyToSubmit && (
        <button className="btn btn-primary" onClick={submitTurn} disabled={disabled}>
          {bustCertain ? 'Submit (bust)' : 'Submit turn'}
        </button>
      )}
    </div>
  )
}
