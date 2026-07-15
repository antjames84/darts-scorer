import { useState } from 'react'

// Single-field visit entry for 501/301, replacing the per-dart NumberPad.
// Type the total for the visit and submit. If that would leave the player
// on exactly zero, it asks for a double-out confirmation before finishing
// the leg, since real rules require checking out on a double.
export default function TurnScoreEntry({ remaining, onSubmitTurn, disabled }) {
  const [value, setValue] = useState('')
  const [pendingCheckout, setPendingCheckout] = useState(null) // { score }

  function press(d) {
    if (disabled) return
    if (value.length >= 3) return
    const next = value + d
    if (Number(next) > 180) return
    setValue(next)
  }

  function backspace() {
    setValue((v) => v.slice(0, -1))
  }

  function clear() {
    setValue('')
  }

  function submit() {
    if (disabled || value === '') return
    const score = Number(value)
    if (Number.isNaN(score) || score < 0 || score > 180) return

    if (remaining - score === 0) {
      setPendingCheckout({ score })
      return
    }
    onSubmitTurn(score, { dartsUsed: 3, checkoutDouble: false })
    setValue('')
  }

  function confirmCheckout(dartsUsed) {
    onSubmitTurn(pendingCheckout.score, { dartsUsed, checkoutDouble: true })
    setPendingCheckout(null)
    setValue('')
  }

  function rejectCheckout() {
    // Reached zero without a double: a bust under normal darts rules.
    onSubmitTurn(pendingCheckout.score, { dartsUsed: 3, checkoutDouble: false })
    setPendingCheckout(null)
    setValue('')
  }

  if (pendingCheckout) {
    return (
      <div className="stack checkout-confirm">
        <p style={{ margin: 0 }}>That leaves 0 — did you finish on a double?</p>
        <div className="btn-row">
          <button className="btn btn-outline" onClick={rejectCheckout}>No, it's a bust</button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '8px 0 0' }}>
          Yes — how many darts did that visit take?
        </p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => confirmCheckout(1)}>1</button>
          <button className="btn btn-primary" onClick={() => confirmCheckout(2)}>2</button>
          <button className="btn btn-primary" onClick={() => confirmCheckout(3)}>3</button>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="score-entry-display">{value || '0'}</div>
      <div className="numpad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} onClick={() => press(String(n))} disabled={disabled}>{n}</button>
        ))}
        <button onClick={() => press('0')} disabled={disabled}>0</button>
        <button onClick={clear} disabled={disabled}>C</button>
        <button onClick={backspace} disabled={disabled}>⌫</button>
      </div>
      <button className="btn btn-primary" onClick={submit} disabled={disabled || value === ''}>
        Submit
      </button>
    </div>
  )
}
