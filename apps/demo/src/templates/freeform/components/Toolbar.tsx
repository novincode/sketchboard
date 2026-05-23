'use client'

import React, { useRef, useCallback, useEffect } from 'react'
import type { ToolId } from '../types'
import { useFreeformStore } from '../store'
import { TOOL_DEFS, TOOLBAR_SLOTS } from '../toolDefs'

// ─── Snap geometry ────────────────────────────────────────────────────────────

type SnapEdge = 'bottom' | 'left' | 'right' | 'top'
const SNAP_THRESHOLD = 80
const EDGE_MARGIN = 12
const TOP_BAR_H = 52
const TOOLBAR_CROSS_AXIS = 52
const TOOLBAR_MAIN_ESTIMATED_H = 360
const TOOLBAR_MAIN_ESTIMATED_W = 400

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

        {/* Color swatch */}
        <button
          onClick={toggleColorPicker}
          className="h-7 w-7 rounded-full border-2 border-white/25 shadow-inner hover:border-white/50 transition shrink-0"
          style={{ backgroundColor: brushColor }}
          title="Color"
        />

        <Divider vertical={isVertical} />

        {/* Tool buttons — one per slot */}
        {TOOLBAR_SLOTS.map((slot) => (
          <ToolButton
            key={slot.ids[0]}
            slot={slot.ids}
            activeToolId={activeToolId}
            vertical={isVertical}
            onSelect={setActiveToolId}
          />
        ))}
      </div>
    </div>
  )
}

// ─── ToolButton ───────────────────────────────────────────────────────────────

function ToolButton({
  slot, activeToolId, vertical, onSelect,
}: {
  slot: ToolId[]
  activeToolId: ToolId
  vertical: boolean
  onSelect: (id: ToolId) => void
}) {
  const activeInSlot = slot.find((id) => id === activeToolId)
  const displayId = activeInSlot ?? slot[0]!
  const def = TOOL_DEFS[displayId]
  if (!def) return null

  const Icon = def.Icon
  const isActive = !!activeInSlot
  const hasSiblings = slot.length > 1

  const handleClick = (e: React.MouseEvent) => {
    if (hasSiblings && e.shiftKey) {
      // Shift+click: cycle to the next sibling in the slot
      const currentIdx = slot.indexOf(displayId)
      const nextId = slot[(currentIdx + 1) % slot.length]!
      onSelect(nextId)
    } else {
      // Plain click always activates the primary (first) tool in the slot
      onSelect(slot[0]!)
    }
  }

  const slotLabel = slot.map((id) => TOOL_DEFS[id]?.label ?? id).join(' / ')

  return (
    <button
      onClick={handleClick}
      title={hasSiblings ? `${slotLabel} (Shift+click to cycle)` : def.label}
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
        <span className="absolute bottom-1 right-1 h-1 w-1 rounded-full bg-white/35" />
      )}
    </button>
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

