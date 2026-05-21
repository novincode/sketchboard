'use client'

import React from 'react'
import { useFreeformStore } from '../store'
import { TOOLS } from '../types'

export function StatusBar() {
  const { activeToolId } = useFreeformStore()
  const tool = TOOLS.find((t) => t.id === activeToolId)

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <div className="rounded-full border border-white/10 bg-black/50 px-4 py-1.5 text-[11px] text-white/25 backdrop-blur-md">
        <span className="text-white/40">{tool?.label}</span>
        {' · '}
        <kbd className="rounded bg-white/10 px-1 py-px font-mono text-[10px]">Space</kbd> pan
        {' · '}
        <kbd className="rounded bg-white/10 px-1 py-px font-mono text-[10px]">⌘Z</kbd> undo
        {' · '}
        <kbd className="rounded bg-white/10 px-1 py-px font-mono text-[10px]">[ ]</kbd> size
        {' · '}
        scroll / pinch to zoom
      </div>
    </div>
  )
}
