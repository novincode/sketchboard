'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { FillTool } from '@sketchboard/core'
import { useFreeformStore } from '../store'

/**
 * Procreate ColorDrop — unified pipeline for raster AND vector.
 *
 * Phase 1: AIMING
 *   The swatch is dragging. A colored disc follows the cursor anywhere on
 *   the screen. NO fill happens yet — the user is just deciding where to drop.
 *
 * Phase 2: ARMING (cursor over canvas, mostly stationary)
 *   When the cursor enters the canvas and stays within DROP_RADIUS for
 *   DROP_DELAY_MS, a charging ring around the disc fills up. This avoids
 *   the "instantly stamped into the background as I dragged past" bug.
 *
 * Phase 3: COMMIT (delay elapsed)
 *   - Raster layer: FillTool.scrubBeginAtScreen fires (full-res initial
 *     fill at current tolerance). Horizontal motion from this point on
 *     scrubs tolerance live (low-res preview, identical to bucket tool).
 *   - Vector layer: FillTool.fillAtScreenPoint fires (one-shot insert
 *     of a closed bezier path). No scrub since vector fills are discrete.
 *
 * Phase 4: RELEASE / CANCEL
 *   - pointerup on raster: scrub commits as one history entry, ripple
 *     animation plays at the drop point.
 *   - pointerup on vector: already committed at phase 3, just play ripple.
 *   - ESC or pointer leaves the canvas before commit: cancel cleanly.
 */

const DROP_DELAY_MS = 550        // how long the cursor must rest before firing
const DROP_RADIUS_PX = 14        // movement budget while arming
const SCRUB_CANCEL_DIST = 80     // raster: drag this far off-canvas → abort scrub

export function ColorDropOverlay() {
  const colorDrag = useFreeformStore((s) => s.colorDrag)
  const ripples = useFreeformStore((s) => s.colorDropRipples)
  const board = useFreeformStore((s) => s.board)

  // Phase tracking. We deliberately use refs (not state) for the hot-path
  // values so pointermove updates don't trigger React renders 60 times/sec.
  const phaseRef = useRef<'aiming' | 'arming' | 'scrubbing' | 'committed'>('aiming')
  const armStartRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const dropPointRef = useRef<{ x: number; y: number } | null>(null)

  // Charge progress (0–1) updates state at ~rAF cadence for the ring fill;
  // bounded by render budget by clamping the React state set frequency.
  const [chargeProgress, setChargeProgress] = useState(0)
  const lastChargeRef = useRef(0)

  // Reset everything when the drag ends or no board exists.
  useEffect(() => {
    if (!colorDrag) {
      phaseRef.current = 'aiming'
      armStartRef.current = null
      dropPointRef.current = null
      setChargeProgress(0)
      lastChargeRef.current = 0
      return
    }
    if (!board) return

    const fill = board.getTool<FillTool>('fill')
    const canvasEl = board.canvas.parentElement
    if (!fill || !canvasEl) return

    let chargeRaf: number | null = null

    const insideCanvas = (clientX: number, clientY: number): { lx: number; ly: number } | null => {
      const rect = canvasEl.getBoundingClientRect()
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null
      return { lx: clientX - rect.left, ly: clientY - rect.top }
    }

    const updateCharge = () => {
      chargeRaf = null
      const arm = armStartRef.current
      if (!arm) { lastChargeRef.current = 0; setChargeProgress(0); return }
      const elapsed = performance.now() - arm.t
      const pct = Math.max(0, Math.min(1, elapsed / DROP_DELAY_MS))
      // Throttle React state writes: only push when the visual changes meaningfully.
      if (Math.abs(pct - lastChargeRef.current) > 0.04 || pct === 1 || pct === 0) {
        lastChargeRef.current = pct
        setChargeProgress(pct)
      }
      // If we crossed the threshold while arming, fire the drop.
      if (pct >= 1 && phaseRef.current === 'arming') {
        fireDrop(arm.x, arm.y)
        return
      }
      // Keep ticking while we're still arming.
      if (phaseRef.current === 'arming') {
        chargeRaf = requestAnimationFrame(updateCharge)
      }
    }

    const fireDrop = (clientX: number, clientY: number) => {
      const inside = insideCanvas(clientX, clientY)
      if (!inside) {
        // Lost the canvas between the arming check and now — bail.
        cancelArm()
        return
      }
      dropPointRef.current = { x: clientX, y: clientY }
      const dragColor = colorDrag.color
      // Raster: start a scrub (initial fill is full-res inside scrubBeginAtScreen).
      // Vector: scrubBeginAtScreen returns false; fall back to one-shot fill.
      const startedScrub = fill.scrubBeginAtScreen(inside.lx, inside.ly, dragColor)
      if (startedScrub) {
        phaseRef.current = 'scrubbing'
      } else {
        // Vector path (or click missed the bitmap) — one-shot, no scrub.
        fill.fillAtScreenPoint(inside.lx, inside.ly, dragColor)
        phaseRef.current = 'committed'
      }
      armStartRef.current = null
      setChargeProgress(0)
      lastChargeRef.current = 0
    }

    const cancelArm = () => {
      armStartRef.current = null
      lastChargeRef.current = 0
      setChargeProgress(0)
      if (chargeRaf !== null) { cancelAnimationFrame(chargeRaf); chargeRaf = null }
      phaseRef.current = 'aiming'
    }

    const playRipple = (x: number, y: number, color: string) => {
      const id = Date.now() + Math.random()
      useFreeformStore.setState((s) => ({
        colorDropRipples: [...s.colorDropRipples, { id, x, y, color }],
      }))
      setTimeout(() => {
        useFreeformStore.setState((s) => ({
          colorDropRipples: s.colorDropRipples.filter((r) => r.id !== id),
        }))
      }, 700)
    }

    const onMove = (e: PointerEvent) => {
      useFreeformStore.getState().updateColorDrag(e.clientX, e.clientY)
      const inside = insideCanvas(e.clientX, e.clientY)

      if (phaseRef.current === 'scrubbing') {
        if (inside) {
          fill.scrubMove(inside.lx, inside.ly)
        } else {
          // Allow some grace — only abort if we drift far away.
          const drop = dropPointRef.current
          if (!drop || Math.hypot(e.clientX - drop.x, e.clientY - drop.y) > SCRUB_CANCEL_DIST) {
            fill.scrubCancel()
            phaseRef.current = 'committed' // committed = "done", won't re-arm
          }
        }
        return
      }

      if (phaseRef.current === 'committed') return

      // Aiming or arming phase.
      if (!inside) {
        if (phaseRef.current === 'arming') cancelArm()
        return
      }

      // Arrived over the canvas — start arming, or check if we moved too far.
      if (phaseRef.current === 'aiming') {
        armStartRef.current = { x: e.clientX, y: e.clientY, t: performance.now() }
        phaseRef.current = 'arming'
        if (chargeRaf === null) chargeRaf = requestAnimationFrame(updateCharge)
        return
      }

      // Phase is 'arming'. If we've moved beyond the arm radius, restart the timer.
      const arm = armStartRef.current
      if (arm) {
        const d = Math.hypot(e.clientX - arm.x, e.clientY - arm.y)
        if (d > DROP_RADIUS_PX) {
          armStartRef.current = { x: e.clientX, y: e.clientY, t: performance.now() }
          lastChargeRef.current = 0
          setChargeProgress(0)
        }
      }
    }

    const onUp = (e: PointerEvent) => {
      const phase = phaseRef.current
      const inside = insideCanvas(e.clientX, e.clientY)
      const dragColor = colorDrag.color

      if (phase === 'scrubbing') {
        fill.scrubEnd()
        const drop = dropPointRef.current
        playRipple(drop?.x ?? e.clientX, drop?.y ?? e.clientY, dragColor)
      } else if (phase === 'committed') {
        // Already fired (vector path). Ripple already played? No — play it now.
        const drop = dropPointRef.current
        if (drop) playRipple(drop.x, drop.y, dragColor)
      } else if (inside && phase === 'arming') {
        // User released before the charge completed but they were over the
        // canvas — treat as an explicit "I want to fill here NOW" intent.
        // (Matches Procreate: release-over-canvas always commits.)
        const startedScrub = fill.scrubBeginAtScreen(inside.lx, inside.ly, dragColor)
        if (startedScrub) fill.scrubEnd()
        else fill.fillAtScreenPoint(inside.lx, inside.ly, dragColor)
        playRipple(e.clientX, e.clientY, dragColor)
      }
      // Else: released over chrome / outside without arming → silent cancel.

      if (chargeRaf !== null) { cancelAnimationFrame(chargeRaf); chargeRaf = null }
      useFreeformStore.getState().cancelColorDrag()
    }

    const onCancel = () => {
      if (phaseRef.current === 'scrubbing') fill.scrubCancel()
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
          <DropCursor color={colorDrag.color} chargeProgress={chargeProgress} />
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

/**
 * The disc itself + the charging ring rendered via an SVG circle so we can
 * `stroke-dashoffset` it for a clean progress sweep with zero layout work.
 */
function DropCursor({ color, chargeProgress }: { color: string; chargeProgress: number }) {
  const R = 22                // ring radius
  const C = 2 * Math.PI * R   // circumference
  return (
    <div className="relative" style={{ width: 56, height: 56 }}>
      {/* Ring */}
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
      {/* Disc */}
      <div
        className="absolute rounded-full border-2 border-white/80 shadow-2xl"
        style={{
          left: 10, top: 10, width: 36, height: 36,
          backgroundColor: color,
          boxShadow: `0 8px 28px ${color}80, 0 0 0 6px ${color}26`,
        }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          left: 10, top: 10, width: 36, height: 36,
          boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.55), inset 0 -3px 6px rgba(0,0,0,0.25)',
        }}
      />
    </div>
  )
}
