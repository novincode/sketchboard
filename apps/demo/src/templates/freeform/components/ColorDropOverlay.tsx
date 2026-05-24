'use client'

import React, { useEffect, useRef } from 'react'
import type { FillTool } from '@sketchboard/core'
import { useFreeformStore } from '../store'

/**
 * Procreate ColorDrop visuals and gesture controller.
 *
 *   1. Swatch begins drag → floating colored disc tethered to the cursor.
 *   2. Cursor enters canvas → FillTool starts a raster scrub at that point
 *      using the dragged color, immediately filling the region.
 *   3. While the finger / pen is still down, horizontal motion adjusts
 *      tolerance live (Procreate-style ColorDrop slider) using the same
 *      FillTool scrub primitive as the bucket tool — no duplicate flood logic.
 *   4. Release → scrub commits as a single history entry; ripple plays.
 *
 * All in-flight pointer tracking lives here (one set of window listeners per
 * mount) so drag sources only need to call `beginColorDrag` and forget.
 */
export function ColorDropOverlay() {
  const colorDrag = useFreeformStore((s) => s.colorDrag)
  const ripples = useFreeformStore((s) => s.colorDropRipples)
  const board = useFreeformStore((s) => s.board)

  // Track whether the in-flight drag has transitioned into a FillTool scrub.
  const scrubbingRef = useRef(false)

  useEffect(() => {
    if (!colorDrag) {
      scrubbingRef.current = false
      return
    }
    if (!board) return
    const fill = board.getTool<FillTool>('fill')
    const canvasEl = board.canvas.parentElement

    const insideCanvas = (x: number, y: number): { lx: number; ly: number } | null => {
      const rect = canvasEl?.getBoundingClientRect()
      if (!rect) return null
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null
      return { lx: x - rect.left, ly: y - rect.top }
    }

    const onMove = (e: PointerEvent) => {
      useFreeformStore.getState().updateColorDrag(e.clientX, e.clientY)
      if (!fill) return
      const inside = insideCanvas(e.clientX, e.clientY)

      if (!scrubbingRef.current && inside) {
        // First entry into the canvas → start a raster scrub right now.
        // This is the "drop" — the fill happens immediately at the current
        // position. From now on, horizontal motion drives tolerance.
        const ok = fill.scrubBeginAtScreen(inside.lx, inside.ly, colorDrag.color)
        if (ok) scrubbingRef.current = true
      } else if (scrubbingRef.current && inside) {
        fill.scrubMove(inside.lx, inside.ly)
      } else if (scrubbingRef.current && !inside) {
        // User dragged back out of the canvas — leave scrub running (matches
        // Procreate; you can wiggle outside to commit by releasing). Could
        // alternatively cancel here.
      }
    }

    const onUp = (e: PointerEvent) => {
      const inside = insideCanvas(e.clientX, e.clientY)
      const wasScrubbing = scrubbingRef.current
      scrubbingRef.current = false

      if (wasScrubbing && fill) {
        fill.scrubEnd()
        // Ripple at the canvas-local commit point.
        const rippleX = inside ? e.clientX : e.clientX
        const rippleY = inside ? e.clientY : e.clientY
        const id = Date.now() + Math.random()
        const color = colorDrag.color
        useFreeformStore.setState((s) => ({
          colorDropRipples: [...s.colorDropRipples, { id, x: rippleX, y: rippleY, color }],
        }))
        setTimeout(() => {
          useFreeformStore.setState((s) => ({
            colorDropRipples: s.colorDropRipples.filter((r) => r.id !== id),
          }))
        }, 700)
      } else if (!wasScrubbing && inside && fill) {
        // Released over the canvas but never entered a scrub (e.g. vector
        // layer or click missed the canvas pixels). Fall back to one-shot.
        fill.fillAtScreenPoint(inside.lx, inside.ly, colorDrag.color)
      }

      useFreeformStore.getState().cancelColorDrag()
    }

    const onCancel = () => {
      if (scrubbingRef.current && fill) fill.scrubCancel()
      scrubbingRef.current = false
      useFreeformStore.getState().cancelColorDrag()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }

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
  }, [colorDrag, board])

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
