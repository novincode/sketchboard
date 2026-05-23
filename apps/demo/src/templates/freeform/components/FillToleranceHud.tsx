'use client'

import React from 'react'
import { useFreeformStore } from '../store'

/**
 * Procreate-style HUD pinned to the cursor during a bucket-fill drag.
 * Shows the live tolerance value while the user scrubs left/right.
 * Driven entirely by store.fillPreview, which the FillTool tickles via the
 * core `toolPreview` hook.
 */
export function FillToleranceHud() {
  const preview = useFreeformStore((s) => s.fillPreview)
  if (!preview) return null

  const board = useFreeformStore.getState().board
  const canvas = board?.canvas.parentElement
  const rect = canvas?.getBoundingClientRect()
  const left = (rect?.left ?? 0) + preview.x + 18
  const top  = (rect?.top  ?? 0) + preview.y - 36
  const pct = Math.round((preview.tolerance / 255) * 100)

  return (
    <div
      className="pointer-events-none fixed z-[10000] flex flex-col items-stretch gap-1 rounded-lg border border-white/15 bg-black/75 px-2.5 py-1.5 text-[10px] font-mono text-white/90 shadow-2xl backdrop-blur"
      style={{ left, top, minWidth: 96 }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-white/55 uppercase tracking-wider">Tolerance</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="relative h-1 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400 to-amber-200 transition-[width] duration-75"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
