'use client'

import React from 'react'
import { Undo2, Redo2, Layers } from 'lucide-react'
import { useFreeformStore } from '../store'

export function TopBar() {
  const { board, brushColor, showLayerPanel, toggleColorPicker, toggleLayerPanel } =
    useFreeformStore()

  const handleUndo = () => board?.history.undo()
  const handleRedo = () => board?.history.redo()

  return (
    <div className="fixed top-3 left-0 right-0 z-50 flex items-center justify-between px-4 pointer-events-none">
      {/* Left: undo / redo */}
      <div className="flex items-center gap-1 pointer-events-auto">
        <Chip onClick={handleUndo} label="Undo">
          <Undo2 size={15} strokeWidth={1.8} />
        </Chip>
        <Chip onClick={handleRedo} label="Redo">
          <Redo2 size={15} strokeWidth={1.8} />
        </Chip>
      </div>

      {/* Right: color + layers */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Color disk */}
        <button
          onClick={toggleColorPicker}
          title="Color"
          className="h-8 w-8 rounded-full shadow-lg ring-2 ring-white/20 transition hover:scale-105 focus:outline-none"
          style={{ background: brushColor }}
          aria-label={`Active color ${brushColor}`}
        />

        {/* Layers */}
        <Chip
          onClick={toggleLayerPanel}
          label="Layers"
          active={showLayerPanel}
        >
          <Layers size={15} strokeWidth={1.8} />
        </Chip>
      </div>
    </div>
  )
}

function Chip({
  onClick,
  label,
  active = false,
  children,
}: {
  onClick: () => void
  label: string
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={[
        'flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-100 focus:outline-none',
        active
          ? 'border-blue-500/50 bg-blue-500/20 text-blue-400'
          : 'border-white/10 bg-black/60 text-white/60 hover:bg-white/10 hover:text-white backdrop-blur-lg',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
