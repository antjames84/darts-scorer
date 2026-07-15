import { useEffect } from 'react'

// Keeps the screen from auto-locking while a play screen is open — a real
// game has natural pauses between throws (walking to the board and back)
// that would otherwise trip the phone's normal sleep timer. Supported in
// Safari from iOS 16.4 onward; anywhere older or unsupported this just
// quietly does nothing, no error, no crash.
export function useWakeLock(active) {
  useEffect(() => {
    if (!active) return
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    let sentinel = null
    let cancelled = false

    async function requestLock() {
      try {
        sentinel = await navigator.wakeLock.request('screen')
      } catch {
        // Browser refused it (e.g. low battery mode) — nothing more to do.
      }
    }

    function handleVisibility() {
      // The browser force-releases the lock whenever the tab is
      // backgrounded, so it has to be re-requested once it's visible
      // again, or the very next backgrounding (switching apps briefly,
      // taking a call) would leave the screen unprotected for the rest
      // of the session.
      if (document.visibilityState === 'visible' && !cancelled) {
        requestLock()
      }
    }

    requestLock()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      if (sentinel) sentinel.release().catch(() => {})
    }
  }, [active])
}
