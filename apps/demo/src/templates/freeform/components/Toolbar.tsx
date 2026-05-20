'use client'

import React, { useState } from 'react'
import {
  Pen,
  Paintbrush,
  Pencil,
  Eraser,
  Hand,
  Pipette,
  Download,
  Layers,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import type { ToolId } from '../types'
import { TOOLS } from '../types'
import { useFreeformStore } from '../store'

// ─── Icon map ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  pen: Pen,
  brush: Paintbrush,
  pencil: Pencil,
  eraser: Eraser,
  hand: Hand,
  eyedropper: Pipette,
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

export function Toolbar() {
  const { activeToolId, brushColor, setActiveToolId, toggleColorPicker, toggleBrushPanel, exportPng } =
    useFreeformStore()

  return (
    <div
      className="fixed left-4 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-black/60 px-2 py-3 shadow-2xl backdrop-blur-xl"
      style={{ minWidth: 52 }}
    >
      {/* Drawing tools */}
      {TOOLS.map((tool) => {
        const Icon = ICON_MAP[tool.icon] ?? Pen
        const isActive = activeToolId === tool.id
        return (
          <ToolButton
            key={tool.id}
            icon={<Icon size={18} strokeWidth={1.75} />}
            label={`${tool.label} (${tool.shortcut})`}
            active={isActive}
            onClick={() => setActiveToolId(tool.id as ToolId)}
          />
        )
      })}

      <Divider />

      {/* Color swatch */}
      <button
        onClick={toggleColorPicker}
        title="Color picker"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:scale-105 focus:outline-none"
        style={{
          background: brushColor,
          boxShadow: `0 0 0 2px rgba(255,255,255,0.15), 0 0 0 1px ${brushColor}`,
        }}
        aria-label={`Active color: ${brushColor}`}
      />

      <Divider />

      {/* Brush settings */}
      <ToolButton
        icon={<Settings2 size={16} strokeWidth={1.75} />}
        label="Brush settings"
        active={false}
        onClick={toggleBrushPanel}
      />

      {/* Export */}
      <ToolButton
        icon={<Download size={16} strokeWidth={1.75} />}
        label="Export PNG"
        active={false}
        onClick={() => exportPng()}
      />
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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
        'flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-150 focus:outline-none',
        active
          ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
          : 'text-white/50 hover:bg-white/10 hover:text-white/90',
      ].join(' ')}
    >
      {icon}
    </button>
  )
}

function Divider() {
  return <div className="my-1 h-px w-7 bg-white/10" />
}
