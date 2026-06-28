import React, { useState } from 'react'

interface Props {
  onEndGame: () => void
  onHistory: () => void
  onHelp: () => void
}

export default function MenuBar({ onEndGame, onHistory, onHelp }: Props) {
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
        { label: 'End Game', onClick: onEndGame },
        { label: '', onClick: () => {}, sep: true },
        { label: 'History', onClick: onHistory },
      ])}
      {item('help', 'Help', [
        { label: 'Rules', onClick: onHelp },
        { label: 'About', onClick: () => alert('Slovenian Tarok — built with Claude') },
      ])}
    </div>
  )
}
