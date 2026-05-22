'use client'

import React, { useRef, useState, useCallback } from 'react'
import {
  Paintbrush, Eraser, Hand, Pipette, Spline,
  PenTool as PenToolIcon, MousePointer2,
  type LucideIcon,
} from 'lucide-react'
import type { ToolId } from '../types'
import { TOOLS } from '../types'
import { useFreeformStore } from '../store'

const ICON_MAP: Record<string, LucideIcon> = {
  select:     MousePointer2,
  brush:      Paintbrush,
  eraser:     Eraser,
  vector:     Spline,
  vectorpen:  PenToolIcon,   // the classic pen-nib icon used in Figma/Illustrator
  eyedropper: Pipette,
  hand:       Hand,
}

export function Toolbar() {
  const { activeToolId, setActiveToolId, brushColor, toggleColorPicker } = useFreeformStore()

  // ── Draggable toolbar ───────────────────────────────────────────────────────
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const startRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  const onGripDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    startRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y }
    e.preventDefault()
  }, [offset])

  const onGripMove = useCallback((e: React.PointerEvent) => {
    if (!startRef.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const dx = e.clientX - startRef.current.px
    const dy = e.clientY - startRef.current.py
    setOffset({ x: startRef.current.ox + dx, y: startRef.current.oy + dy })
  }, [])

  const onGripUp = useCallback((e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    startRef.current = null
  }, [])

  return (
    <div
      className="fixed bottom-4 left-1/2 z-50"
      style={{ transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)` }}
    >
      <div className="flex items-center gap-1 rounded-[22px] border border-white/12 bg-black/80 px-2.5 py-2 shadow-2xl backdrop-blur-xl">

        {/* Drag handle */}
        <div
          className="mr-0.5 flex cursor-grab items-center px-1 active:cursor-grabbing"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          title="Drag to move toolbar"
        >
          <GripDotsIcon />
        </div>

        {/* Color swatch */}
        <button
          onClick={toggleColorPicker}
          title="Color (click to change)"
          className="mr-1 h-7 w-7 rounded-full border-2 border-white/25 shadow-inner transition hover:border-white/50 shrink-0"
          style={{ backgroundColor: brushColor }}
        />

        <div className="w-px h-5 rounded bg-white/10 mx-0.5" />

        {TOOLS.map((tool) => {
          const Icon = ICON_MAP[tool.icon] ?? Paintbrush
          const active = activeToolId === tool.id
          return (
            <button
              key={tool.id}
              onClick={() => setActiveToolId(tool.id as ToolId)}
              title={`${tool.label}  (${tool.shortcut})`}
              aria-label={tool.label}
              aria-pressed={active}
              className={[
                'relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-100 focus:outline-none',
                active
                  ? 'bg-white/15 text-white ring-1 ring-white/35'
                  : 'text-white/40 hover:bg-white/8 hover:text-white/75',
              ].join(' ')}
            >
              <Icon size={16} strokeWidth={1.75} />
              {active && (
                <span className="absolute -bottom-1 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-white/55" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function GripDotsIcon() {
  return (
    <svg width="8" height="16" viewBox="0 0 8 16" fill="currentColor" className="text-white/20">
      <circle cx="2" cy="4" r="1.5" />
      <circle cx="6" cy="4" r="1.5" />
      <circle cx="2" cy="8" r="1.5" />
      <circle cx="6" cy="8" r="1.5" />
      <circle cx="2" cy="12" r="1.5" />
      <circle cx="6" cy="12" r="1.5" />
    </svg>
  )
}
