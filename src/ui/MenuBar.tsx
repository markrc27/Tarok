import React, { useState } from 'react'

interface Props {
  onEndGame: () => void
  onHistory: () => void
  onLeaderboard: () => void
  onHelp: () => void
  onAbout: () => void
  cardAppearance: 'simple' | 'traditional'
  onSetCardAppearance: (a: 'simple' | 'traditional') => void
}

export default function MenuBar({ onEndGame, onHistory, onLeaderboard, onHelp, onAbout, cardAppearance, onSetCardAppearance }: Props) {
  const [open, setOpen] = useState<string | null>(null)

  const toggle = (menu: string) => setOpen(o => o === menu ? null : menu)
  const close = () => setOpen(null)

  const item = (menu: string, label: string, items: { label: string; onClick: () => void; sep?: boolean; disabled?: boolean }[]) => (
    <div className={`menu-item${open === menu ? ' open' : ''}`}>
      <button onMouseDown={() => toggle(menu)}>{label}</button>
      <div className="menu-dropdown">
        {items.map((it, i) => (
          it.sep ? <hr key={i} /> :
          <button key={i} onClick={() => { if (!it.disabled) { it.onClick(); close() } }}
            style={it.disabled ? { color: '#888', cursor: 'default' } : undefined}
          >{it.label}</button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="menu-bar" onMouseLeave={close}>
      {item('game', 'Game', [
        { label: 'End Game', onClick: onEndGame },
        { label: '', onClick: () => {}, sep: true },
        { label: 'History', onClick: onHistory },
        { label: 'Leaderboard', onClick: onLeaderboard },
      ])}
      {item('options', 'Options', [
        { label: 'Card Appearance', onClick: () => {}, disabled: true },
        { label: (cardAppearance === 'simple' ? '✓ ' : '   ') + 'Simple', onClick: () => onSetCardAppearance('simple') },
        { label: (cardAppearance === 'traditional' ? '✓ ' : '   ') + 'Traditional', onClick: () => onSetCardAppearance('traditional') },
      ])}
      {item('help', 'Help', [
        { label: 'Rules', onClick: onHelp },
        { label: 'About', onClick: onAbout },
      ])}
      <span style={{ marginLeft: 'auto', padding: '0 10px', color: '#f0f0f0', fontSize: 13, lineHeight: '24px', opacity: 0.6 }}>
        v{__APP_VERSION__}
      </span>
    </div>
  )
}
