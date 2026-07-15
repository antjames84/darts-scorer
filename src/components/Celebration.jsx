import { useEffect } from 'react'

// A brief full-screen celebration for the moments that deserve one: a
// checkout, finishing Round the Clock. Self-contained — the <style> tag
// carries its own keyframes so this doesn't depend on anything defined
// in styles.css, which keeps it safe to drop in without knowing what
// else that file already does.
export default function Celebration({ message, onDone, durationMs = 1600 }) {
  useEffect(() => {
    const t = setTimeout(onDone, durationMs)
    return () => clearTimeout(t)
  }, [onDone, durationMs])

  const bits = ['🎯', '🔥', '⭐']

  return (
    <>
      <style>{`
        @keyframes celebration-pop {
          0% { transform: scale(0.6); opacity: 0; }
          45% { transform: scale(1.08); opacity: 1; }
          70% { transform: scale(1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes celebration-fade {
          0%, 75% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes celebration-confetti {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(160px) rotate(340deg); opacity: 0; }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)',
          zIndex: 1000,
          animation: `celebration-fade ${durationMs}ms ease forwards`,
        }}
      >
        <div style={{ position: 'relative', textAlign: 'center' }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${(i * 41) % 100}%`,
                top: -16,
                fontSize: 20,
                animation: `celebration-confetti ${0.8 + (i % 5) * 0.15}s ease-in ${i * 0.05}s forwards`,
              }}
            >
              {bits[i % bits.length]}
            </span>
          ))}
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: '#fff',
              padding: '18px 28px',
              background: 'var(--accent, #e6533c)',
              borderRadius: 14,
              animation: 'celebration-pop 0.5s ease',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            {message}
          </div>
        </div>
      </div>
    </>
  )
}
