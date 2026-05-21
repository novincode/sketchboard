'use client'

import React from 'react'
import {
  Pen, Paintbrush, Eraser, Hand, Pipette, Spline,
  type LucideIcon,
} from 'lucide-react'
import type { ToolId } from '../types'
import { TOOLS } from '../types'
import { useFreeformStore } from '../store'

const ICON_MAP: Record<string, LucideIcon> = {
  pen:        Pen,
  brush:      Paintbrush,
  eraser:     Eraser,
  vector:     Spline,
  eyedropper: Pipette,
  hand:       Hand,
}

export function Toolbar() {
  const { activeToolId, setActiveToolId, brushColor, toggleColorPicker } = useFreeformStore()

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-1.5 rounded-[22px] border border-white/12 bg-black/75 px-3 py-2.5 shadow-2xl backdrop-blur-xl">

        {/* Color swatch */}
        <button
          onClick={toggleColorPicker}
          title="Color (tap to open picker)"
          className="mr-1 h-8 w-8 rounded-full border-2 border-white/20 shadow-inner transition hover:border-white/40 shrink-0"
          style={{ backgroundColor: brushColor }}
        />

        <div className="w-px h-6 rounded bg-white/10 mr-0.5" />

        {/* Tool buttons */}
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
                'relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-100 focus:outline-none',
                active
                  ? 'bg-white/15 text-white ring-1 ring-white/30'
                  : 'text-white/45 hover:bg-white/8 hover:text-white/80',
              ].join(' ')}
            >
              <Icon size={18} strokeWidth={1.75} />
              {active && (
                <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white/60" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
