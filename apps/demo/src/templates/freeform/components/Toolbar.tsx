'use client'

import React from 'react'
import {
  Pen, Paintbrush, Eraser, Hand, Pipette, Spline, PenLine, MousePointer2,
  type LucideIcon,
} from 'lucide-react'
import type { ToolId } from '../types'
import { TOOLS } from '../types'
import { useFreeformStore } from '../store'

const ICON_MAP: Record<string, LucideIcon> = {
  select:     MousePointer2,
  pen:        Pen,
  brush:      Paintbrush,
  eraser:     Eraser,
  vector:     Spline,
  vectorpen:  PenLine,
  eyedropper: Pipette,
  hand:       Hand,
}

export function Toolbar() {
  const { activeToolId, setActiveToolId, brushColor, toggleColorPicker } = useFreeformStore()

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-[22px] border border-white/12 bg-black/75 px-3 py-2.5 shadow-2xl backdrop-blur-xl">

        {/* Color swatch */}
        <button
          onClick={toggleColorPicker}
          title="Color (click to change)"
          className="mr-1.5 h-7 w-7 rounded-full border-2 border-white/20 shadow-inner transition hover:border-white/45 shrink-0"
          style={{ backgroundColor: brushColor }}
        />

        <div className="w-px h-5 rounded bg-white/10 mx-0.5" />

        {TOOLS.map((tool) => {
          const Icon = ICON_MAP[tool.icon] ?? Pen
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
                  ? 'bg-white/15 text-white ring-1 ring-white/30'
                  : 'text-white/40 hover:bg-white/8 hover:text-white/75',
              ].join(' ')}
            >
              <Icon size={16} strokeWidth={1.75} />
              {active && (
                <span className="absolute -bottom-1 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-white/50" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
