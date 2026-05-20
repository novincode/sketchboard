import React from 'react'
import type { Background } from '../types'

export function CanvasBackground({ type }: { type: Background }) {
  if (type === 'none') return null

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={type === 'dots' ? DOTS_STYLE : GRID_STYLE}
    />
  )
}

const DOTS_STYLE: React.CSSProperties = {
  backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
  backgroundSize: '24px 24px',
}

const GRID_STYLE: React.CSSProperties = {
  backgroundImage: `
    linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)
  `,
  backgroundSize: '24px 24px',
}
