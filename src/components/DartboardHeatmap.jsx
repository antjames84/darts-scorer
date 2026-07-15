// Renders the 20 outer segments in their real board order (20 at the
// top, then clockwise) plus the bull as a centre circle, each coloured
// by hit rate — red for weak, green for strong, grey for no data yet.
// Pure presentational component: takes the same {target, attempts, hits,
// rate} shape computeNumberStats() already produces.

const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]

function polar(cx, cy, r, angleDeg) {
  const a = (angleDeg * Math.PI) / 180
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)]
}

function wedgePath(cx, cy, innerR, outerR, startAngle, endAngle) {
  const [x1, y1] = polar(cx, cy, outerR, startAngle)
  const [x2, y2] = polar(cx, cy, outerR, endAngle)
  const [x3, y3] = polar(cx, cy, innerR, endAngle)
  const [x4, y4] = polar(cx, cy, innerR, startAngle)
  return `M ${x1} ${y1} A ${outerR} ${outerR} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 0 0 ${x4} ${y4} Z`
}

function colorFor(stat) {
  if (!stat || stat.attempts === 0 || stat.rate == null) return '#2a2f3a'
  const hue = Math.round(stat.rate * 120) // 0 = red, 120 = green
  return `hsl(${hue}, 60%, 42%)`
}

function opacityFor(stat) {
  if (!stat || stat.attempts === 0) return 0.55
  return Math.min(1, 0.45 + stat.attempts * 0.06)
}

export default function DartboardHeatmap({ stats }) {
  const byNumber = {}
  stats.forEach((s) => { byNumber[s.target] = s })

  const cx = 160
  const cy = 160
  const outerR = 150
  const innerR = 40
  const bullR = 40
  const wedgeAngle = 360 / 20

  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 320 320" style={{ width: '100%', maxWidth: 320, height: 'auto' }}>
        {BOARD_ORDER.map((num, i) => {
          const start = i * wedgeAngle - wedgeAngle / 2
          const end = start + wedgeAngle
          const stat = byNumber[num]
          const [lx, ly] = polar(cx, cy, (innerR + outerR) / 2, start + wedgeAngle / 2)
          return (
            <g key={num}>
              <path
                d={wedgePath(cx, cy, innerR, outerR, start, end)}
                fill={colorFor(stat)}
                opacity={opacityFor(stat)}
                stroke="#111"
                strokeWidth={1}
              />
              <text
                x={lx}
                y={ly}
                fill="#fff"
                fontSize={15}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {num}
              </text>
            </g>
          )
        })}

        <circle
          cx={cx}
          cy={cy}
          r={bullR}
          fill={colorFor(byNumber[25])}
          opacity={opacityFor(byNumber[25])}
          stroke="#111"
          strokeWidth={1}
        />
        <text x={cx} y={cy} fill="#fff" fontSize={13} fontWeight={700} textAnchor="middle" dominantBaseline="middle">
          Bull
        </text>
      </svg>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Weak</span>
        <div
          style={{
            width: 120,
            height: 8,
            borderRadius: 4,
            background: 'linear-gradient(90deg, hsl(0,60%,42%), hsl(60,60%,42%), hsl(120,60%,42%))',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Strong</span>
      </div>
    </div>
  )
}
