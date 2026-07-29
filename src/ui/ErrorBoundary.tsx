import React from 'react'

const GAME_STATE_KEY = 'tarok-game-state'
export const RECOVERY_FLAG = 'tarok-auto-recovered'

interface State { hasError: boolean }

/**
 * Catches any render/lifecycle crash so a bad persisted state can never leave a
 * permanent blank page. The usual trigger: mobile Safari reloads a
 * long-backgrounded tab, the store rehydrates stale/incompatible state from
 * localStorage (e.g. after a new deploy), and the first render throws.
 *
 * On a crash we clear the saved game and auto-reload ONCE per tab session; if it
 * still crashes we show a manual Restart button instead of looping forever.
 */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    try { localStorage.removeItem(GAME_STATE_KEY) } catch { /* ignore */ }
    console.error('Tarok crashed on load; cleared saved game state.', error)
    try {
      if (!sessionStorage.getItem(RECOVERY_FLAG)) {
        sessionStorage.setItem(RECOVERY_FLAG, '1')
        window.location.reload()
      }
    } catch { /* ignore */ }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: '#1a5c2a', color: '#f0f0f0',
        fontFamily: "'Segoe UI', Tahoma, sans-serif", textAlign: 'center', padding: 24,
      }}>
        <h1 style={{ fontSize: 26 }}>Tarok</h1>
        <p style={{ color: '#cde', maxWidth: 320, lineHeight: 1.5 }}>
          The saved game couldn't be restored, so it's been cleared. Tap Restart to begin a fresh game.
        </p>
        <button
          onClick={() => {
            try { localStorage.removeItem(GAME_STATE_KEY) } catch { /* ignore */ }
            window.location.reload()
          }}
          style={{
            background: '#0078d4', border: 'none', color: '#fff',
            padding: '10px 30px', borderRadius: 4, fontSize: 16, cursor: 'pointer',
          }}
        >
          Restart
        </button>
      </div>
    )
  }
}
