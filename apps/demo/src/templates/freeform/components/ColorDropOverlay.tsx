'use client'

import React, { useEffect } from 'react'
import { useFreeformStore } from '../store'

/**
 * Procreate ColorDrop visuals: a floating colored disc tethered to the cursor
 * while the user is dragging the color swatch, plus an expanding ripple at
 * each drop point where a fill actually landed. All position state lives in
 * the Zustand store (`colorDrag`, `colorDropRipples`) so this component is
 * pure presentation.
 *
 * Pointer-move/up tracking for the in-flight drag is handled GLOBALLY here
 * (one set of window listeners per mount) so individual drag sources (e.g.
 * Toolbar swatch) only need to call beginColorDrag — they don't have to
 * pointer-capture, attach window handlers, or worry about pointer loss.
 */
export function ColorDropOverlay() {
  const colorDrag = useFreeformStore((s) => s.colorDrag)
  const ripples = useFreeformStore((s) => s.colorDropRipples)

  useEffect(() => {
    if (!colorDrag) return
    const onMove = (e: PointerEvent) => useFreeformStore.getState().updateColorDrag(e.clientX, e.clientY)
    const onUp = (e: PointerEvent) => useFreeformStore.getState().endColorDrag(e.clientX, e.clientY)
    const onCancel = () => useFreeformStore.getState().cancelColorDrag()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') useFreeformStore.getState().cancelColorDrag() }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
    }
  }, [colorDrag])

  return (
    <>
      <style>{`
        @keyframes colorDragIn {
          from { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
          to   { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
        }
        @keyframes colorDropRipple {
          0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0.55; }
          60%  { opacity: 0.35; }
          100% { transform: translate(-50%, -50%) scale(4.5); opacity: 0; }
        }
        @keyframes colorDropCore {
          0%   { transform: translate(-50%, -50%) scale(1);   opacity: 0.9; }
          70%  { transform: translate(-50%, -50%) scale(1.8); opacity: 0.5; }
          100% { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
        }
      `}</style>

      {colorDrag && (
        <div
          className="pointer-events-none fixed z-[10001]"
          style={{
            left: colorDrag.x, top: colorDrag.y,
            transform: 'translate(-50%, -50%)',
            animation: 'colorDragIn 130ms ease-out',
          }}
        >
          <div
            className="rounded-full border-2 border-white/80 shadow-2xl"
            style={{
              width: 36, height: 36,
              backgroundColor: colorDrag.color,
              boxShadow: `0 8px 28px ${colorDrag.color}80, 0 0 0 6px ${colorDrag.color}26`,
            }}
          />
          {/* Inner ring + outer halo for a "liquid drop" feel */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.55), inset 0 -3px 6px rgba(0,0,0,0.25)',
            }}
          />
        </div>
      )}

      {ripples.map((r) => (
        <div
          key={r.id}
          className="pointer-events-none fixed z-[10000]"
          style={{ left: r.x, top: r.y }}
        >
          <div
            className="absolute rounded-full"
            style={{
              left: 0, top: 0, width: 56, height: 56,
              backgroundColor: r.color,
              animation: 'colorDropRipple 650ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              left: 0, top: 0, width: 24, height: 24,
              backgroundColor: r.color,
              animation: 'colorDropCore 500ms ease-out forwards',
              boxShadow: `0 0 18px ${r.color}aa`,
            }}
          />
        </div>
      ))}
    </>
  )
}
