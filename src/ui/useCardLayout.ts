import { useState, useEffect } from 'react'

export interface CardLayout {
  cardW: number
  cardH: number
  handStep: number
  aiStep: number
}

function compute(vw: number): CardLayout {
  const cardW = Math.round(Math.max(52, Math.min(90, vw * 0.14)))
  const cardH = Math.round(cardW * 1.5)
  const handStep = Math.round(Math.max(28, Math.min(50, vw * 0.075)))
  const aiStep = Math.round(Math.max(10, Math.min(14, vw * 0.022)))
  return { cardW, cardH, handStep, aiStep }
}

export function useCardLayout(): CardLayout {
  const [layout, setLayout] = useState<CardLayout>(() => compute(window.innerWidth))

  useEffect(() => {
    const handler = () => {
      const next = compute(window.innerWidth)
      setLayout(prev =>
        prev.cardW === next.cardW && prev.cardH === next.cardH ? prev : next
      )
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--card-w', `${layout.cardW}px`)
    document.documentElement.style.setProperty('--card-h', `${layout.cardH}px`)
  }, [layout.cardW, layout.cardH])

  return layout
}
