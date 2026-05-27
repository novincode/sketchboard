'use client'

import React, { useRef, useCallback, useEffect, useState } from 'react'
import type { ToolId } from '../types'
import { useFreeformStore } from '../store'
import { TOOL_DEFS, TOOLBAR_SLOTS, type ToolSlot } from '../toolDefs'
import { ToolbarFlyout, type FlyoutSide } from './ToolbarFlyout'

// ─── Snap geometry ────────────────────────────────────────────────────────────

type SnapEdge = 'bottom' | 'left' | 'right' | 'top'
const SNAP_THRESHOLD = 80
const EDGE_MARGIN = 12
const TOP_BAR_H = 52
const TOOLBAR_MAIN_ESTIMATED_H = 360
const TOOLBAR_MAIN_ESTIMATED_W = 400
const LONG_PRESS_MS = 380

function computeSnap(x: number, y: number): { snap: SnapEdge; offset: number } {
  const vw = window.innerWidth, vh = window.innerHeight
  if (y > vh - SNAP_THRESHOLD) return { snap: 'bottom', offset: x / vw }
  if (y < SNAP_THRESHOLD)       return { snap: 'top',    offset: x / vw }
  if (x < SNAP_THRESHOLD)       return { snap: 'left',   offset: y / vh }
  if (x > vw - SNAP_THRESHOLD)  return { snap: 'right',  offset: y / vh }
  return { snap: 'bottom', offset: x / vw }
}

function clampOffset(snap: SnapEdge, raw: number): number {
  if (typeof window === 'undefined') return raw
  const vw = window.innerWidth, vh = window.innerHeight
  if (snap === 'bottom' || snap === 'top') {
    const half = TOOLBAR_MAIN_ESTIMATED_W / 2
    const margin = EDGE_MARGIN + half
    return Math.max(margin / vw, Math.min(1 - margin / vw, raw))
  }
  const topEdge = (TOP_BAR_H + EDGE_MARGIN + TOOLBAR_MAIN_ESTIMATED_H / 2) / vh
  const botEdge = 1 - (EDGE_MARGIN + TOOLBAR_MAIN_ESTIMATED_H / 2) / vh
  return Math.max(topEdge, Math.min(botEdge, raw))
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

export function Toolbar() {
  const { activeToolId, setActiveToolId, brushColor, toggleColorPicker, toolbarSnap, toolbarEdgeOffset, setToolbarSnap } = useFreeformStore()

  const dragRef = useRef<{ startPX: number; startPY: number } | null>(null)

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onGripDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startPX: e.clientX, startPY: e.clientY }
    e.preventDefault()
  }, [])

  const onGripMove = useCallback((e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !dragRef.current) return
    const { snap, offset } = computeSnap(e.clientX, e.clientY)
    setToolbarSnap(snap, clampOffset(snap, offset))
  }, [setToolbarSnap])

  const onGripUp = useCallback((e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
  }, [])

  const isVertical = toolbarSnap === 'left' || toolbarSnap === 'right'
  const offset = clampOffset(toolbarSnap, toolbarEdgeOffset)

  let toolbarStyle: React.CSSProperties = {}
  if (toolbarSnap === 'bottom') {
    toolbarStyle = { position: 'fixed', bottom: EDGE_MARGIN, left: `${offset * 100}%`, transform: 'translateX(-50%)' }
  } else if (toolbarSnap === 'top') {
    toolbarStyle = { position: 'fixed', top: TOP_BAR_H + EDGE_MARGIN, left: `${offset * 100}%`, transform: 'translateX(-50%)' }
  } else if (toolbarSnap === 'left') {
    toolbarStyle = { position: 'fixed', left: EDGE_MARGIN, top: `${offset * 100}%`, transform: 'translateY(-50%)' }
  } else {
    toolbarStyle = { position: 'fixed', right: EDGE_MARGIN, top: `${offset * 100}%`, transform: 'translateY(-50%)' }
  }

  return (
    <div style={{ ...toolbarStyle, zIndex: 50 }}>
      <div className={[
        'flex items-center gap-1 rounded-[22px] border border-white/12 bg-black/80 shadow-2xl backdrop-blur-xl',
        isVertical ? 'flex-col px-2 py-3' : 'flex-row px-2.5 py-2',
      ].join(' ')}>

        {/* Drag grip */}
        <div
          className={[
            'flex cursor-grab items-center active:cursor-grabbing text-white/18 hover:text-white/38 transition',
            isVertical ? 'py-0.5 px-1' : 'pr-0.5 pl-0.5',
          ].join(' ')}
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          title="Drag to dock toolbar"
        >
          <GripIcon vertical={isVertical} />
        </div>

        {/* Color swatch — tap = open picker, drag onto canvas = ColorDrop fill */}
        <ColorSwatch color={brushColor} onTap={toggleColorPicker} />

        <Divider vertical={isVertical} />

        {/* Tool buttons — one per slot */}
        {TOOLBAR_SLOTS.map((slot) => (
          <ToolButton
            key={slot.ids[0]}
            slot={slot}
            activeToolId={activeToolId}
            vertical={isVertical}
            flyoutSide={toolbarSnap as FlyoutSide}
            onSelect={setActiveToolId}
          />
        ))}
      </div>
    </div>
  )
}

// ─── ToolButton ───────────────────────────────────────────────────────────────

function ToolButton({
  slot, activeToolId, vertical, flyoutSide, onSelect,
}: {
  slot: ToolSlot
  activeToolId: ToolId
  vertical: boolean
  flyoutSide: FlyoutSide
  onSelect: (id: ToolId) => void
}) {
  const ids = slot.ids
  const activeInSlot = ids.find((id) => id === activeToolId)
  const displayId = activeInSlot ?? ids[0]
  const def = TOOL_DEFS[displayId]
  const Icon = def?.Icon
  const isActive = !!activeInSlot
  const hasSiblings = ids.length > 1

  const btnRef = useRef<HTMLButtonElement>(null)
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)

  const openFlyout = useCallback(() => {
    if (!hasSiblings) return
    if (btnRef.current) setAnchorRect(btnRef.current.getBoundingClientRect())
    setFlyoutOpen(true)
  }, [hasSiblings])

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }, [])

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    longPressFired.current = false
    if (hasSiblings) {
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true
        openFlyout()
      }, LONG_PRESS_MS)
    }
  }
  const handlePointerUp = () => cancelLongPress()
  const handlePointerLeave = () => cancelLongPress()

  const handleClick = (e: React.MouseEvent) => {
    if (longPressFired.current) {
      // Long-press already opened the flyout; suppress this click.
      longPressFired.current = false
      return
    }
    cancelLongPress()
    if (hasSiblings && e.shiftKey) {
      const currentIdx = ids.indexOf(displayId)
      const nextId = ids[(currentIdx + 1) % ids.length]!
      onSelect(nextId)
    } else {
      // Plain click activates the currently-shown sibling (so the user can
      // click back to whatever they last picked from the flyout).
      onSelect(displayId)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!hasSiblings) return
    e.preventDefault()
    openFlyout()
  }

  if (!Icon) return null

  const slotLabel = ids.map((id) => TOOL_DEFS[id]?.label ?? id).join(' / ')

  return (
    <>
      <button
        ref={btnRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={hasSiblings ? `${slotLabel} (right-click or long-press for options)` : def!.label}
        aria-pressed={isActive}
        className={[
          'relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-100 focus:outline-none select-none',
          isActive
            ? 'bg-white/15 text-white ring-1 ring-white/35'
            : 'text-white/40 hover:bg-white/8 hover:text-white/75',
        ].join(' ')}
      >
        <Icon size={16} strokeWidth={1.75} />
        {isActive && !vertical && (
          <span className="absolute -bottom-1 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-white/55" />
        )}
        {hasSiblings && (
          <span
            className={[
              'absolute h-1 w-1 rounded-full transition-colors',
              vertical ? 'bottom-1 right-1' : 'bottom-1 right-1',
              flyoutOpen ? 'bg-blue-300' : 'bg-white/35',
            ].join(' ')}
          />
        )}
      </button>

      {flyoutOpen && (
        <ToolbarFlyout
          anchorRect={anchorRect}
          ids={ids}
          activeId={displayId}
          toolbarSide={flyoutSide}
          shortcuts={slot.individualShortcuts}
          onPick={onSelect}
          onClose={() => setFlyoutOpen(false)}
        />
      )}
    </>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Divider({ vertical }: { vertical: boolean }) {
  return <div className={vertical ? 'w-5 h-px rounded bg-white/10' : 'h-8 w-px rounded bg-white/10'} />
}

function GripIcon({ vertical }: { vertical: boolean }) {
  return vertical ? (
    <svg width="12" height="6" viewBox="0 0 12 6" fill="currentColor">
      <circle cx="3" cy="1.5" r="1.2" /><circle cx="9" cy="1.5" r="1.2" />
      <circle cx="3" cy="4.5" r="1.2" /><circle cx="9" cy="4.5" r="1.2" />
    </svg>
  ) : (
    <svg width="6" height="14" viewBox="0 0 6 14" fill="currentColor">
      <circle cx="1.5" cy="3" r="1.2" /><circle cx="4.5" cy="3" r="1.2" />
      <circle cx="1.5" cy="7" r="1.2" /><circle cx="4.5" cy="7" r="1.2" />
      <circle cx="1.5" cy="11" r="1.2" /><circle cx="4.5" cy="11" r="1.2" />
    </svg>
  )
}


// ─── Color swatch — tap to open picker, drag to ColorDrop ─────────────────────

const COLOR_DRAG_THRESHOLD = 6  // px

function ColorSwatch({ color, onTap }: { color: string; onTap: () => void }) {
  const isDragging = useFreeformStore((s) => s.colorDrag !== null)
  const downRef = useRef<{ x: number; y: number; pointerId: number; armed: boolean } | null>(null)
  const initiatedDragRef = useRef(false)

  useEffect(() => {
    if (!isDragging && initiatedDragRef.current) initiatedDragRef.current = false
  }, [isDragging])

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (useFreeformStore.getState().colorDrag) return
    downRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, armed: true }
    initiatedDragRef.current = false
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = downRef.current
    if (!d || !d.armed) return
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > COLOR_DRAG_THRESHOLD) {
      d.armed = false
      initiatedDragRef.current = true
      try { (e.currentTarget as Element).releasePointerCapture?.(e.pointerId) } catch { /* no-op */ }
      ;(e.currentTarget as HTMLElement).blur()
      useFreeformStore.getState().beginColorDrag(color, e.clientX, e.clientY)
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    const d = downRef.current
    downRef.current = null
    if (!d) return
    if (d.armed && !initiatedDragRef.current) onTap()
    ;(e.currentTarget as HTMLElement).blur()
  }

  const handlePointerCancel = () => { downRef.current = null }

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className={[
        'h-7 w-7 rounded-full border-2 shadow-inner shrink-0 select-none touch-none transition-colors',
        isDragging
          ? 'border-white/15 opacity-40'
          : 'border-white/25 hover:border-white/50 cursor-grab',
      ].join(' ')}
      style={{ backgroundColor: color }}
      title="Color — tap to open picker, drag onto canvas to fill"
    />
  )
}
