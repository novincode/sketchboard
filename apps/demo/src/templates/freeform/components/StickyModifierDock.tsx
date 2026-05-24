'use client'

import React, { useEffect, useState } from 'react'
import type { SelectTool } from '@sketchboard/core'
import { useFreeformStore } from '../store'

/**
 * Floating "sticky modifier" dock for tablet / touch use.
 *
 * Hold ⌥ (Option/Alt) or ⇧ (Shift) with one finger and use your pen with the
 * other hand — the modifier stays active for as long as the button is held.
 * Tap to toggle as a one-shot lock (the button stays pressed until tapped
 * again or you draw something).
 *
 * Pushes the modifier state into SelectTool via its public setStickyModifier
 * API (which OR's with the real keyboard state inside the tool) so all
 * existing Alt / Shift behaviors in vector editing and transform work.
 *
 * Hidden on devices with a fine pointer (mouse) so it doesn't clutter the
 * desktop UI — users with a keyboard already have Alt / Shift.
 */
export function StickyModifierDock() {
  const board = useFreeformStore((s) => s.board)
  const [altLocked, setAltLocked] = useState(false)
  const [shiftLocked, setShiftLocked] = useState(false)
  const [altHeld, setAltHeld] = useState(false)
  const [shiftHeld, setShiftHeld] = useState(false)
  const [isTouch, setIsTouch] = useState(false)
  // Desktop dock is visible but collapsed by default; users open it from a
  // tiny pill so the floating button doesn't shout over the canvas.
  const [desktopOpen, setDesktopOpen] = useState(false)

  useEffect(() => {
    // Coarse-pointer devices (touch / pen-primary) get the full dock; mouse
    // users see a small expandable affordance so the feature is still
    // discoverable when a tablet is connected to a desktop browser.
    const mq = window.matchMedia('(pointer: coarse)')
    const update = () => setIsTouch(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!board) return
    const select = board.getTool<SelectTool>('select')
    select?.setStickyModifier('alt',   altHeld || altLocked)
    select?.setStickyModifier('shift', shiftHeld || shiftLocked)
  }, [board, altHeld, altLocked, shiftHeld, shiftLocked])

  // On desktop, render a compact pill that expands into the dock on click.
  // Closing the dock while a modifier is locked keeps the lock active — the
  // pill turns amber so you remember it's still on.
  if (!isTouch && !desktopOpen) {
    const anyActive = altLocked || shiftLocked
    return (
      <button
        onClick={() => setDesktopOpen(true)}
        className={[
          'fixed bottom-4 left-4 z-[9000] flex h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold shadow-2xl backdrop-blur-xl transition select-none',
          anyActive
            ? 'border-amber-400/70 bg-amber-400/20 text-amber-100'
            : 'border-white/12 bg-black/55 text-white/55 hover:text-white/85',
        ].join(' ')}
        title="Sticky modifiers (Alt / Shift)"
      >
        <span className="text-sm leading-none">⌥</span>
        <span className="text-sm leading-none">⇧</span>
        {anyActive && (
          <span className="ml-1 text-[9px] uppercase tracking-widest opacity-80">
            {altLocked && shiftLocked ? 'A·S' : altLocked ? 'Alt' : 'Shift'}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-9000 flex items-end gap-2">
      <ModButton
        label="⌥"
        sub="Alt"
        locked={altLocked}
        held={altHeld}
        onHoldChange={setAltHeld}
        onToggleLock={() => setAltLocked((v) => !v)}
      />
      <ModButton
        label="⇧"
        sub="Shift"
        locked={shiftLocked}
        held={shiftHeld}
        onHoldChange={setShiftHeld}
        onToggleLock={() => setShiftLocked((v) => !v)}
      />
      {!isTouch && (
        <button
          onClick={() => setDesktopOpen(false)}
          className="pointer-events-auto h-7 w-7 rounded-full border border-white/12 bg-black/55 text-xs text-white/55 hover:text-white/85 transition shadow-md"
          title="Collapse"
        >×</button>
      )}
    </div>
  )
}

function ModButton({
  label, sub, locked, held, onHoldChange, onToggleLock,
}: {
  label: string; sub: string
  locked: boolean; held: boolean
  onHoldChange: (v: boolean) => void
  onToggleLock: () => void
}) {
  // Distinguish tap (toggle lock) from hold (press-and-hold semantics):
  // pointerdown marks start; pointerup within 220ms => toggle lock, otherwise the
  // button was held and we just release the held state.
  const startRef = React.useRef<number>(0)

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    startRef.current = performance.now()
    onHoldChange(true)
  }
  const onUp = (e: React.PointerEvent) => {
    const dt = performance.now() - startRef.current
    onHoldChange(false)
    if (dt < 220) onToggleLock()
    void e
  }
  const onCancel = () => onHoldChange(false)

  const active = locked || held

  return (
    <button
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      className={[
        'pointer-events-auto flex h-14 w-14 select-none flex-col items-center justify-center rounded-2xl border shadow-2xl backdrop-blur-xl transition-all touch-none',
        active
          ? 'border-amber-400/60 bg-amber-400/20 text-amber-100 scale-105'
          : 'border-white/15 bg-black/65 text-white/70 hover:text-white',
        locked && !held ? 'ring-2 ring-amber-400/60' : '',
      ].join(' ')}
      style={{ touchAction: 'none' }}
      title={`${sub} — tap to lock, hold to press-and-hold`}
    >
      <span className="text-xl leading-none font-medium">{label}</span>
      <span className="mt-0.5 text-[9px] uppercase tracking-widest opacity-70">{sub}</span>
    </button>
  )
}
