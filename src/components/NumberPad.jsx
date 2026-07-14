import { useState } from 'react'

// Dart entry pad: pick a multiplier then the segment. Resets to Single
// after every throw so you don't accidentally leave Treble selected.
export default function NumberPad({ onThrow, disabled }) {
  const [multiplier, setMultiplier] = useState(1)

  function throwSegment(segment, mult) {
    if (disabled) return
    onThrow(segment, mult)
    setMultiplier(1)
  }

  return (
    <div className="stack">
      <div className="segmented">
        <button className={multiplier === 1 ? 'active' : ''} onClick={() => setMultiplier(1)}>Single</button>
        <button className={multiplier === 2 ? 'active' : ''} onClick={() => setMultiplier(2)}>Double</button>
        <button className={multiplier === 3 ? 'active' : ''} onClick={() => setMultiplier(3)}>Treble</button>
      </div>

      <div className="numpad">
        {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
          <button key={n} onClick={() => throwSegment(n, multiplier)} disabled={disabled}>
            {n}
          </button>
        ))}
        <button onClick={() => throwSegment(25, multiplier === 3 ? 1 : multiplier)} disabled={disabled}>
          {multiplier === 2 ? 'D-Bull' : 'Bull'}
        </button>
        <button onClick={() => throwSegment(0, 0)} disabled={disabled} style={{ gridColumn: 'span 2' }}>
          Miss
        </button>
      </div>
    </div>
  )
}
