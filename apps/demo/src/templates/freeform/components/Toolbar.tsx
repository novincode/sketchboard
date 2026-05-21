'use client'

import React from 'react'
import { Pen, Paintbrush, Pencil, Eraser, Hand, Pipette, Download, type LucideIcon } from 'lucide-react'
import type { ToolId } from '../types'
import { TOOLS } from '../types'
import { useFreeformStore } from '../store'

const ICON_MAP: Record<string, LucideIcon> = {
  pen: Pen,
  brush: Paintbrush,
  pencil: Pencil,
  eraser: Eraser,
  hand: Hand,
  eyedropper: Pipette,
}

export function Toolbar() {
  const { activeToolId, setActiveToolId, exportPng } = useFreeformStore()

  return (
    <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1 rounded-2xl border border-white/10 bg-black/70 px-3 py-2 shadow-2xl backdrop-blur-xl">
      {TOOLS.map((tool) => {
        const Icon = ICON_MAP[tool.icon] ?? Pen
        const active = activeToolId === tool.id
        return (
          <button
            key={tool.id}
            onClick={() => setActiveToolId(tool.id as ToolId)}
            title={`${tool.label} (${tool.shortcut})`}
            aria-label={tool.label}
            aria-pressed={active}
            className={[
              'flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-100 focus:outline-none',
              active
                ? 'bg-blue-500/25 text-blue-400 ring-1 ring-blue-500/60'
                : 'text-white/50 hover:bg-white/10 hover:text-white/90',
            ].join(' ')}
          >
            <Icon size={18} strokeWidth={1.75} />
          </button>
        )
      })}

      <div className="mx-1 h-6 w-px rounded bg-white/10" />

      <button
        onClick={() => exportPng()}
        title="Export PNG"
        aria-label="Export PNG"
        className="flex h-10 w-10 items-center justify-center rounded-xl text-white/40 transition hover:bg-white/10 hover:text-white/90 focus:outline-none"
      >
        <Download size={16} strokeWidth={1.75} />
      </button>
    </div>
  )
}
