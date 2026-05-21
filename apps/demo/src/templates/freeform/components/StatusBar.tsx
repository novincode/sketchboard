'use client'

import React from 'react'
import { useFreeformStore } from '../store'
import { TOOLS } from '../types'

export function StatusBar() {
  const { activeToolId } = useFreeformStore()
  const tool = TOOLS.find((t) => t.id === activeToolId)

  return (
    <div className="pointer-events-none fixed bottom-18 left-1/2 z-40 -translate-x-1/2">
      <div className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] text-white/20 backdrop-blur-md">
        <span className="text-white/35">{tool?.label}</span>
        {' · '}Space pan · ⌘Z undo · [ ] size · scroll zoom
      </div>
    </div>
  )
}
