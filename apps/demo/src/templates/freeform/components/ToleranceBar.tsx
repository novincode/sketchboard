'use client'

import React, { memo } from 'react'

/**
 * Reusable optimized 0–100% scrub indicator shown at the top of the canvas.
 *
 * Designed to be cheap to update every animation frame:
 *   - memoized
 *   - leaf component (no children, no context subscriptions of its own)
 *   - uses pure CSS for the fill bar via `width: ${pct}%` so React only
 *     re-renders an inline style string, not the layout
 *   - no animation on the fill itself — `transition: width` would lag the
 *     truth at high update rates
 *
 * Reused by the fill-bucket scrub HUD and by the ColorDrop tolerance scrub.
 * Take any other scrubbable parameter (size, opacity, hardness…) and pin it
 * here for the same visual language.
 */
export interface ToleranceBarProps {
  /** 0–100 (caller normalizes whatever unit it represents). */
  pct: number
  /** Top-row label, e.g. "Fill tolerance". */
  label: string
  /** Optional unit suffix shown after the numeric value. Default '%'. */
  unit?: string
  /** Optional accent color for the fill bar. */
  accentClassName?: string
  /** Track width in px. Default 240. */
  width?: number
}

export const ToleranceBar = memo(function ToleranceBar({
  pct, label, unit = '%',
  accentClassName = 'bg-gradient-to-r from-amber-300 via-amber-200 to-white',
  width = 240,
}: ToleranceBarProps) {
  const clamped = Math.max(0, Math.min(100, pct))
  const rounded = Math.round(clamped)

  return (
    <div className="pointer-events-none fixed top-3 left-1/2 z-[10000] -translate-x-1/2 tol-bar-enter">
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/80 px-4 py-2.5 shadow-2xl backdrop-blur-xl">
        <span className="select-none text-[10px] font-semibold uppercase tracking-widest text-white/45">
          {label}
        </span>

        <div className="relative h-1.5 overflow-hidden rounded-full bg-white/10" style={{ width }}>
          <div className="absolute top-0 bottom-0 w-px bg-white/15" style={{ left: '50%' }} />
          <div
            className={'absolute inset-y-0 left-0 ' + accentClassName}
            style={{ width: `${clamped}%` }}
          />
        </div>

        <span
          className="select-none font-mono text-xs tabular-nums text-white/85"
          style={{ minWidth: 36, textAlign: 'right' }}
        >
          {rounded}{unit}
        </span>
      </div>

      <style>{`
        .tol-bar-enter { animation: tolBarIn 120ms ease-out; }
        @keyframes tolBarIn {
          from { opacity: 0; transform: translate(-50%, -6px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  )
})
