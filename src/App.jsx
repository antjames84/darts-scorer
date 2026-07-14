import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ensureDefaultPlayer } from './db.js'
import Home from './pages/Home.jsx'
import Players from './pages/Players.jsx'
import NewCountdown from './pages/NewCountdown.jsx'
import NewClock from './pages/NewClock.jsx'
import PlayCountdown from './pages/PlayCountdown.jsx'
import PlayClock from './pages/PlayClock.jsx'
import Stats from './pages/Stats.jsx'
import History from './pages/History.jsx'
import MatchDetail from './pages/MatchDetail.jsx'

export default function App() {
  useEffect(() => {
    ensureDefaultPlayer()
  }, [])

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/players" element={<Players />} />
      <Route path="/new/countdown" element={<NewCountdown />} />
      <Route path="/new/clock" element={<NewClock />} />
      <Route path="/play/countdown/:matchId" element={<PlayCountdown />} />
      <Route path="/play/clock/:matchId" element={<PlayClock />} />
      <Route path="/stats" element={<Stats />} />
      <Route path="/history" element={<History />} />
      <Route path="/history/:matchId" element={<MatchDetail />} />
    </Routes>
  )
}
