import React from 'react'

interface Props {
  soundEnabled: boolean
  onToggleSound: () => void
  onClose: () => void
}

export default function OptionsDialog({ soundEnabled, onToggleSound, onClose }: Props) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Options</h2>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={soundEnabled} onChange={onToggleSound} />
          Sound effects
        </label>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
