'use client'

import React from 'react'
import { Undo2, Redo2, Layers, Download } from 'lucide-react'
import { useFreeformStore } from '../store'

export function TopBar() {
  const { board, showLayerPanel, toggleLayerPanel, exportPng } = useFreeformStore()

  return (
    <div className="fixed top-3 left-0 right-0 z-50 flex items-center justify-between px-4 pointer-events-none">
      {/* Left: undo / redo */}
      <div className="flex items-center gap-1 pointer-events-auto">
        <IconBtn onClick={() => board?.history.undo()} label="Undo (⌘Z)">
          <Undo2 size={15} strokeWidth={1.8} />
        </IconBtn>
        <IconBtn onClick={() => board?.history.redo()} label="Redo (⌘⇧Z)">
          <Redo2 size={15} strokeWidth={1.8} />
        </IconBtn>
      </div>

      {/* Right: layers + export */}
      <div className="flex items-center gap-1.5 pointer-events-auto">
        <IconBtn onClick={toggleLayerPanel} label="Layers" active={showLayerPanel}>
          <Layers size={15} strokeWidth={1.8} />
        </IconBtn>
        <IconBtn onClick={() => exportPng()} label="Export PNG">
          <Download size={15} strokeWidth={1.8} />
        </IconBtn>
      </div>
    </div>
  )
}

function IconBtn({
  onClick, label, active = false, children,
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
          ? 'border-blue-500/40 bg-blue-500/20 text-blue-400'
          : 'border-white/10 bg-black/60 text-white/55 hover:bg-white/10 hover:text-white backdrop-blur-lg',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
