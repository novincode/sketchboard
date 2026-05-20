'use client'

import React from 'react'
import { useFreeformStore } from '../store'
import { TOOLS } from '../types'

export function StatusBar() {
  const { activeToolId } = useFreeformStore()
  const tool = TOOLS.find((t) => t.id === activeToolId)

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <div className="rounded-full border border-white/10 bg-black/50 px-4 py-1.5 text-xs text-white/30 backdrop-blur-md">
        {tool?.label ?? activeToolId} ·{' '}
        <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[10px]">Space</kbd> pan ·{' '}
        <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[10px]">⌘Z</kbd> undo ·{' '}
        <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-[10px]">[ ]</kbd> size ·{' '}
        scroll to zoom
      </div>
    </div>
  )
}
