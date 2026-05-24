'use client'

import React from 'react'
import { useFreeformStore } from '../store'

/**
 * Top-of-screen slider HUD shown while the bucket-fill tool is being scrubbed
 * (Procreate's drag-left/right to adjust tolerance). The bar is centered, fades
 * in/out, and shows both numeric % and a filled track. Driven entirely by
 * store.fillPreview which the FillTool tickles via the core `toolPreview` hook.
 */
export function FillToleranceHud() {
  const preview = useFreeformStore((s) => s.fillPreview)
  if (!preview) return null

  const pct = Math.round((preview.tolerance / 255) * 100)

  return (
    <div className="pointer-events-none fixed top-3 left-1/2 z-[10000] -translate-x-1/2 fill-hud-enter">
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/80 px-4 py-2.5 shadow-2xl backdrop-blur-xl">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/45 select-none">Fill tolerance</span>

        <div className="relative h-1.5 rounded-full bg-white/10 overflow-hidden" style={{ width: 240 }}>
          {/* Center tick at 50% for reference */}
          <div className="absolute top-0 bottom-0 w-px bg-white/15" style={{ left: '50%' }} />
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-300 via-amber-200 to-white transition-[width] duration-75"
            style={{ width: `${pct}%` }}
          />
        </div>

        <span className="tabular-nums font-mono text-xs text-white/85 select-none" style={{ minWidth: 36, textAlign: 'right' }}>
          {pct}%
        </span>
      </div>

      <style>{`
        .fill-hud-enter { animation: fillHudIn 120ms ease-out; }
        @keyframes fillHudIn {
          from { opacity: 0; transform: translate(-50%, -6px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  )
}
