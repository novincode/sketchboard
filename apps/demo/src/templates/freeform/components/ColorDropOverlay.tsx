'use client'

import React, { useEffect, useRef, useState, memo } from 'react'
import type { FillTool } from '@sketchboard/core'
import { useFreeformStore } from '../store'

/**
 * Procreate-style ColorDrop with hold-to-commit + tolerance scrub.
 *
 *   AIMING  → disc follows cursor, nothing fires
 *   ARMING  → cursor over canvas + stationary within DROP_RADIUS_PX;
 *             charging ring fills over DROP_DELAY_MS
 *   COMMIT  → raster: FillTool.scrubBeginAtScreen (full-res initial fill),
 *             then horizontal motion runs FillTool.scrubMove for live tolerance.
 *             vector: FillTool.fillAtScreenPoint (one-shot)
 *   RELEASE → scrub commits (raster) / already done (vector); ripple plays
 *
 * CRITICAL: the gesture-controller effect must NOT re-run on pointermove.
 * Previously it did, because we subscribed to the full `colorDrag` object
 * (whose .x/.y changes every event) — every frame tore down the window
 * listeners and cancelled the charging rAF, so arming never completed.
 *
 * The controller now subscribes only to a STABLE identity (the color hex of
 * the active drag, or null). Position rendering is split into a separate
 * memoized child that subscribes to `colorDrag` directly.
 */

const DROP_DELAY_MS = 550
const DROP_RADIUS_PX = 14
const SCRUB_CANCEL_DIST = 80

export function ColorDropOverlay() {
  // Stable identity: only changes when a drag starts or ends (not on move).
  const dragColor = useFreeformStore((s) => s.colorDrag?.color ?? null)
  const board = useFreeformStore((s) => s.board)

  // Charge progress (0–1) drives the ring animation. Updated at rAF cadence
  // but throttled to ~4% deltas so it doesn't render 60 times/sec.
  const [chargeProgress, setChargeProgress] = useState(0)

  useEffect(() => {
    if (!dragColor || !board) {
      setChargeProgress(0)
      return
    }

    const fill = board.getTool<FillTool>('fill')
    const canvasEl = board.canvas.parentElement
    if (!fill || !canvasEl) return

    // All hot-path state lives in refs so handler activity does NOT cause
    // the effect to re-run.
    let phase: 'aiming' | 'arming' | 'scrubbing' | 'committed' = 'aiming'
    let armStart: { x: number; y: number; t: number } | null = null
    let dropPoint: { x: number; y: number } | null = null
    let lastCharge = 0
    let chargeRaf: number | null = null

    const insideCanvas = (clientX: number, clientY: number): { lx: number; ly: number } | null => {
      const rect = canvasEl.getBoundingClientRect()
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null
      return { lx: clientX - rect.left, ly: clientY - rect.top }
    }

    const tick = () => {
      chargeRaf = null
      if (phase !== 'arming' || !armStart) return
      const elapsed = performance.now() - armStart.t
      const pct = Math.max(0, Math.min(1, elapsed / DROP_DELAY_MS))
      if (Math.abs(pct - lastCharge) > 0.04 || pct === 1) {
        lastCharge = pct
        setChargeProgress(pct)
      }
      if (pct >= 1) {
        fireDrop(armStart.x, armStart.y)
        return
      }
      chargeRaf = requestAnimationFrame(tick)
    }

    const startArm = (clientX: number, clientY: number) => {
      armStart = { x: clientX, y: clientY, t: performance.now() }
      lastCharge = 0
      setChargeProgress(0)
      phase = 'arming'
      if (chargeRaf === null) chargeRaf = requestAnimationFrame(tick)
    }

    const cancelArm = () => {
      armStart = null
      lastCharge = 0
      setChargeProgress(0)
      phase = 'aiming'
      if (chargeRaf !== null) { cancelAnimationFrame(chargeRaf); chargeRaf = null }
    }

    const fireDrop = (clientX: number, clientY: number) => {
      const inside = insideCanvas(clientX, clientY)
      if (!inside) { cancelArm(); return }
      dropPoint = { x: clientX, y: clientY }
      const startedScrub = fill.scrubBeginAtScreen(inside.lx, inside.ly, dragColor)
      phase = startedScrub ? 'scrubbing' : 'committed'
      if (!startedScrub) {
        // Vector or out-of-bounds raster → one-shot fillAtScreenPoint.
        fill.fillAtScreenPoint(inside.lx, inside.ly, dragColor)
      }
      armStart = null
      lastCharge = 0
      setChargeProgress(0)
      if (chargeRaf !== null) { cancelAnimationFrame(chargeRaf); chargeRaf = null }
    }

    const playRipple = (x: number, y: number) => {
      const id = Date.now() + Math.random()
      useFreeformStore.setState((s) => ({
        colorDropRipples: [...s.colorDropRipples, { id, x, y, color: dragColor }],
      }))
      setTimeout(() => {
        useFreeformStore.setState((s) => ({
          colorDropRipples: s.colorDropRipples.filter((r) => r.id !== id),
        }))
      }, 700)
    }

    const onMove = (e: PointerEvent) => {
      // Position the floating disc via the store.
      useFreeformStore.getState().updateColorDrag(e.clientX, e.clientY)
      const inside = insideCanvas(e.clientX, e.clientY)

      if (phase === 'scrubbing') {
        if (inside) {
          fill.scrubMove(inside.lx, inside.ly)
        } else if (dropPoint && Math.hypot(e.clientX - dropPoint.x, e.clientY - dropPoint.y) > SCRUB_CANCEL_DIST) {
          fill.scrubCancel()
          phase = 'committed'
        }
        return
      }
      if (phase === 'committed') return

      if (!inside) {
        if (phase === 'arming') cancelArm()
        return
      }

      if (phase === 'aiming') {
        startArm(e.clientX, e.clientY)
        return
      }

      // Phase === 'arming': reset the timer if we moved too far.
      if (armStart && Math.hypot(e.clientX - armStart.x, e.clientY - armStart.y) > DROP_RADIUS_PX) {
        startArm(e.clientX, e.clientY)
      }
    }

    const onUp = (e: PointerEvent) => {
      const localPhase = phase
      const inside = insideCanvas(e.clientX, e.clientY)

      if (localPhase === 'scrubbing') {
        fill.scrubEnd()
        const drop = dropPoint
        playRipple(drop?.x ?? e.clientX, drop?.y ?? e.clientY)
      } else if (localPhase === 'committed') {
        const drop = dropPoint
        if (drop) playRipple(drop.x, drop.y)
      } else if (inside) {
        // User released over the canvas before the charge completed.
        // Treat as "fill here now" intent.
        const startedScrub = fill.scrubBeginAtScreen(inside.lx, inside.ly, dragColor)
        if (startedScrub) fill.scrubEnd()
        else fill.fillAtScreenPoint(inside.lx, inside.ly, dragColor)
        playRipple(e.clientX, e.clientY)
      }
      // Else: released over chrome → silent cancel, no fill.

      if (chargeRaf !== null) { cancelAnimationFrame(chargeRaf); chargeRaf = null }
      useFreeformStore.getState().cancelColorDrag()
    }

    const onCancel = () => {
      if (phase === 'scrubbing') fill.scrubCancel()
      if (chargeRaf !== null) { cancelAnimationFrame(chargeRaf); chargeRaf = null }
      useFreeformStore.getState().cancelColorDrag()
    }

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      if (chargeRaf !== null) cancelAnimationFrame(chargeRaf)
    }
  }, [dragColor, board])

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
      <DragDisc chargeProgress={chargeProgress} />
      <Ripples />
    </>
  )
}

// ─── DragDisc: subscribes to colorDrag so the position re-renders here ───────
// (but never re-runs the controller's effect because that's in the parent).

const DragDisc = memo(function DragDisc({ chargeProgress }: { chargeProgress: number }) {
  const drag = useFreeformStore((s) => s.colorDrag)
  if (!drag) return null
  return (
    <div
      className="pointer-events-none fixed z-[10001]"
      style={{
        left: drag.x, top: drag.y,
        transform: 'translate(-50%, -50%)',
        animation: 'colorDragIn 130ms ease-out',
      }}
    >
      <DropCursor color={drag.color} chargeProgress={chargeProgress} />
    </div>
  )
})

const Ripples = memo(function Ripples() {
  const ripples = useFreeformStore((s) => s.colorDropRipples)
  return (
    <>
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
})

/**
 * The disc + SVG progress ring. Pure presentation: stroke-dashoffset drives
 * the sweep with no layout work.
 */
function DropCursor({ color, chargeProgress }: { color: string; chargeProgress: number }) {
  const R = 22
  const C = 2 * Math.PI * R
  return (
    <div className="relative" style={{ width: 56, height: 56 }}>
      <svg className="absolute inset-0" width={56} height={56} viewBox="0 0 56 56">
        <circle cx={28} cy={28} r={R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={3} />
        {chargeProgress > 0 && (
          <circle
            cx={28} cy={28} r={R}
            fill="none"
            stroke="white"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - chargeProgress)}
            transform="rotate(-90 28 28)"
            style={{ transition: 'stroke-dashoffset 60ms linear' }}
          />
        )}
      </svg>
      <div
        className="absolute rounded-full border-2 border-white/80 shadow-2xl"
        style={{
          left: 10, top: 10, width: 36, height: 36,
          backgroundColor: color,
          boxShadow: `0 8px 28px ${color}80, 0 0 0 6px ${color}26`,
        }}
      />
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          left: 10, top: 10, width: 36, height: 36,
          boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.55), inset 0 -3px 6px rgba(0,0,0,0.25)',
        }}
      />
    </div>
  )
}
