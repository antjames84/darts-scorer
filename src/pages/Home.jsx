import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="page">
      <div className="topbar">
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
