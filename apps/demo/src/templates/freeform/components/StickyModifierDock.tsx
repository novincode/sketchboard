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

  useEffect(() => {
    // Show only when there's no fine pointer (touch / pen-primary devices).
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

  if (!isTouch) return null

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[9000] flex gap-2">
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
