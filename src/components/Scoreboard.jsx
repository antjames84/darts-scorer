export default function Scoreboard({ players, activePlayerId, statFor }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {players.map((p) => {
        const active = p.id === activePlayerId
        return (
          <div
            key={p.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderRadius: 10,
              background: active ? 'var(--accent, #e6533c)' : 'var(--card, #1c2530)',
              border: active ? 'none' : '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <span style={{ fontSize: 17, fontWeight: 700, color: active ? '#fff' : 'inherit' }}>{p.name}</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: active ? '#fff' : 'inherit' }}>{statFor(p.id)}</span>
          </div>
        )
      })}
    </div>
  )
}
