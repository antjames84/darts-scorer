import { Link } from 'react-router-dom'

function DartboardIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="16" fill="#1c2530" stroke="#e6533c" strokeWidth="1.5" />
      <circle cx="17" cy="17" r="12" fill="none" stroke="#e6533c" strokeWidth="1.5" opacity="0.6" />
      <circle cx="17" cy="17" r="7" fill="none" stroke="#2e7d32" strokeWidth="1.5" opacity="0.7" />
      <circle cx="17" cy="17" r="3" fill="#e6533c" />
    </svg>
  )
}

export default function Home() {
  return (
    <div className="page">
      <div className="topbar" style={{ gap: 10 }}>
        <DartboardIcon />
        <h1>Home Darts Scorer</h1>
      </div>
      <div className="stack">
        <Link className="btn btn-primary" to="/new/countdown">New 501 / 301 match</Link>
        <Link className="btn btn-primary" to="/new/clock">Round the Clock</Link>
        <Link className="btn btn-outline" to="/stats">Stats &amp; weakest numbers</Link>
        <Link className="btn btn-outline" to="/history">Match history</Link>
        <Link className="btn btn-outline" to="/players">Settings</Link>
      </div>
    </div>
  )
}
