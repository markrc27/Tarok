import React, { useState } from 'react'

interface Props {
  onNewGame: () => void
  onOptions: () => void
  onStatistics: () => void
}

export default function MenuBar({ onNewGame, onOptions, onStatistics }: Props) {
  const [open, setOpen] = useState<string | null>(null)

  const toggle = (menu: string) => setOpen(o => o === menu ? null : menu)
  const close = () => setOpen(null)

  const item = (menu: string, label: string, items: { label: string; onClick: () => void; sep?: boolean }[]) => (
    <div className={`menu-item${open === menu ? ' open' : ''}`}>
      <button onMouseDown={() => toggle(menu)}>{label}</button>
      <div className="menu-dropdown">
        {items.map((it, i) => (
          it.sep ? <hr key={i} /> :
          <button key={i} onClick={() => { it.onClick(); close() }}>{it.label}</button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="menu-bar" onMouseLeave={close}>
      {item('game', 'Game', [
        { label: 'New Round', onClick: onNewGame },
        { label: '', onClick: () => {}, sep: true },
        { label: 'Options', onClick: onOptions },
        { label: 'Statistics', onClick: onStatistics },
      ])}
      {item('help', 'Help', [
        { label: 'About Tarok', onClick: () => alert('Slovenian Tarok — built with Claude') },
      ])}
    </div>
  )
}
