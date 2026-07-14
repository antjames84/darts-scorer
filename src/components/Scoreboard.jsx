export default function Scoreboard({ players, activePlayerId, statFor }) {
  return (
    <div className="player-list">
      {players.map((p) => (
        <div key={p.id} className={`player-row ${p.id === activePlayerId ? 'active' : ''}`}>
          <span>{p.name}</span>
          <span className="badge">{statFor(p.id)}</span>
        </div>
      ))}
    </div>
  )
}
