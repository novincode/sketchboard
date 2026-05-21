'use client'

import React from 'react'
import {
  Pen,
  Paintbrush,
  Pencil,
  Eraser,
  Hand,
  Pipette,
  Download,
  Layers,
  type LucideIcon,
} from 'lucide-react'
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
  const {
    activeToolId,
    brushColor,
    setActiveToolId,
    toggleColorPicker,
    toggleLayerPanel,
    exportPng,
  } = useFreeformStore()

  return (
    <div
      className="fixed left-4 top-1/2 z-50 flex -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border border-white/10 bg-black/65 px-2 py-3 shadow-2xl backdrop-blur-xl"
      style={{ minWidth: 52 }}
    >
      {/* Drawing tools */}
      {TOOLS.map((tool) => {
        const Icon = ICON_MAP[tool.icon] ?? Pen
        return (
          <ToolButton
            key={tool.id}
            icon={<Icon size={18} strokeWidth={1.75} />}
            label={`${tool.label} (${tool.shortcut})`}
            active={activeToolId === tool.id}
            onClick={() => setActiveToolId(tool.id as ToolId)}
          />
        )
      })}

      <Divider />

      {/* Active color swatch — click to open color picker */}
      <button
        onClick={toggleColorPicker}
        title="Color (click to change)"
        aria-label={`Active color: ${brushColor}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:scale-105 focus:outline-none"
        style={{
          background: brushColor,
          boxShadow: `0 0 0 2px rgba(255,255,255,0.15)`,
        }}
      />

      <Divider />

      {/* Layers panel toggle */}
      <ToolButton
        icon={<Layers size={16} strokeWidth={1.75} />}
        label="Layers"
        active={false}
        onClick={toggleLayerPanel}
      />

      {/* Export PNG */}
      <ToolButton
        icon={<Download size={16} strokeWidth={1.75} />}
        label="Export PNG"
        active={false}
        onClick={() => exportPng()}
      />
    </div>
  )
}

function ToolButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={[
        'flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-100 focus:outline-none',
        active
          ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
          : 'text-white/45 hover:bg-white/10 hover:text-white/90',
      ].join(' ')}
    >
      {icon}
    </button>
  )
}

function Divider() {
  return <div className="my-1 h-px w-7 rounded bg-white/10" />
}
