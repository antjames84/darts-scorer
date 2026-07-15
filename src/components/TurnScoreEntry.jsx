import { useState } from 'react'
import { dartValue } from '../game/countdown.js'

// Per-dart visit entry for 501/301. Pick a multiplier, tap a segment, and
// that dart's value (segment * multiplier, or 25/50 for bull) fills the
// next of three boxes and adds to a running total. Only the total for
// the whole visit is ever sent to the game engine via onSubmitTurn, same
// as before — countdown.js and PlayCountdown.jsx don't need to change.
export default function TurnScoreEntry({ remaining, onSubmitTurn, disabled }) {
  const [multiplier, setMultiplier] = useState(1)
  const [darts, setDarts] = useState([]) // values already entered this turn, max 3
  const [pendingCheckout, setPendingCheckout] = useState(null) // { total, dartsUsed }

  const total = darts.reduce((sum, d) => sum + d, 0)
  const remainingAfter = remaining - total
  const bustCertain = remainingAfter < 0 || remainingAfter === 1
  const readyToSubmit = darts.length === 3 || bustCertain

  function throwDart(segment, mult) {
    if (disabled || readyToSubmit || darts.length >= 3) return
    const value = dartValue(segment, mult)

    const nextDarts = [...darts, value]
    const nextTotal = nextDarts.reduce((s, v) => s + v, 0)
    setDarts(nextDarts)
    setMultiplier(1)

    if (remaining - nextTotal === 0) {
      setPendingCheckout({ total: nextTotal, dartsUsed: nextDarts.length })
    }
  }

  function removeLastDart() {
    if (disabled) return
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

  if (pendingCheckout) {
    return (
      <div className="stack checkout-confirm">
        <p style={{ margin: 0 }}>That leaves 0 — did you finish on a double?</p>
        <div className="btn-row">
          <button className="btn btn-outline" onClick={rejectCheckout}>No, it's a bust</button>
          <button className="btn btn-primary" onClick={confirmCheckout}>Yes, checkout!</button>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
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
              {filled !== undefined ? filled : isActive ? '·' : '·'}
            </div>
          )
        })}
      </div>

      <div className="label" style={{ textAlign: 'center' }}>
        Total: {total}{bustCertain ? ' — bust' : ''}
      </div>

      {!readyToSubmit && (
        <>
          <div className="segmented">
            <button className={multiplier === 1 ? 'active' : ''} onClick={() => setMultiplier(1)} disabled={disabled}>Single</button>
            <button className={multiplier === 2 ? 'active' : ''} onClick={() => setMultiplier(2)} disabled={disabled}>Double</button>
            <button className={multiplier === 3 ? 'active' : ''} onClick={() => setMultiplier(3)} disabled={disabled}>Treble</button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 8,
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
                  fontSize: 18,
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
            <button
              onClick={() => throwDart(25, 1)}
              disabled={disabled}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 700,
                background: 'var(--card, #1c2530)',
                color: 'inherit',
                border: 'none',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              25
            </button>
            <button
              onClick={() => throwDart(25, 2)}
              disabled={disabled}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 700,
                background: 'var(--card, #1c2530)',
                color: 'inherit',
                border: 'none',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              Bull
            </button>
            <button
              onClick={() => throwDart(0, 0)}
              disabled={disabled}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 700,
                background: 'var(--card, #1c2530)',
                color: 'inherit',
                border: 'none',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              Miss
            </button>
          </div>
        </>
      )}

      {darts.length > 0 && (
        <button className="btn btn-outline" onClick={removeLastDart} disabled={disabled}>
          Remove last dart
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
