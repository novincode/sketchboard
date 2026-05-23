'use client'

import React, { useRef, useState, useEffect } from 'react'
import { MoreHorizontal, Undo2, Redo2, Layers, Download, type LucideIcon } from 'lucide-react'
import { useFreeformStore } from '../store'
import { TOOL_DEFS } from '../toolDefs'

// ─── TopBar ───────────────────────────────────────────────────────────────────

export function TopBar() {
  const { board, activeToolId, showLayerPanel, toggleLayerPanel, exportPng } = useFreeformStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const def = TOOL_DEFS[activeToolId]
  const OptionsPanel = def?.OptionsPanel ?? null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-start justify-between px-3 pt-3 pointer-events-none">

      {/* Left: ··· menu button */}
      <div className="pointer-events-auto shrink-0" ref={menuRef}>
        <div className="relative">
          <Pill>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              title="Menu"
              className={[
                'flex h-7 w-7 items-center justify-center rounded-lg transition-all focus:outline-none',
                menuOpen
                  ? 'bg-white/15 text-white ring-1 ring-white/25'
                  : 'text-white/45 hover:bg-white/8 hover:text-white/80',
              ].join(' ')}
            >
              <MoreHorizontal size={15} strokeWidth={1.8} />
            </button>
          </Pill>

          {menuOpen && (
            <div className="absolute left-0 top-full mt-1.5 z-50 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#111]/95 shadow-2xl backdrop-blur-xl min-w-40">
              <MenuAction Icon={Undo2} label="Undo" shortcut="⌘Z" onClick={() => { board?.history.undo(); setMenuOpen(false) }} />
              <MenuAction Icon={Redo2} label="Redo" shortcut="⌘⇧Z" onClick={() => { board?.history.redo(); setMenuOpen(false) }} />
            </div>
          )}
        </div>
      </div>

      {/* Center: active tool name + options — auto-width, centered */}
      {def && (
        <div className="pointer-events-auto mx-3 min-w-0 max-w-[min(640px,60vw)]">
          <Pill>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-white/35">
              {def.label}
            </span>
            {OptionsPanel && (
              <>
                <div className="h-5 w-px rounded bg-white/10 shrink-0" />
                <div className="flex items-center gap-2 min-w-0 overflow-x-auto scrollbar-hide">
                  <OptionsPanel />
                </div>
              </>
            )}
          </Pill>
        </div>
      )}

      {/* Right: layers + export */}
      <div className="pointer-events-auto shrink-0 flex gap-1.5">
        <Pill>
          <IconBtn onClick={toggleLayerPanel} label="Layers" active={showLayerPanel}>
            <Layers size={14} strokeWidth={1.8} />
          </IconBtn>
          <IconBtn onClick={() => exportPng()} label="Export PNG">
            <Download size={14} strokeWidth={1.8} />
          </IconBtn>
        </Pill>
      </div>

    </div>
  )
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/80 px-3 py-2 shadow-xl backdrop-blur-xl min-h-12">
      {children}
    </div>
  )
}

// ─── Menu action ──────────────────────────────────────────────────────────────

function MenuAction({ Icon, label, shortcut, onClick }: {
  Icon: LucideIcon; label: string; shortcut?: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-white/60 hover:bg-white/8 hover:text-white/90 transition"
    >
      <Icon size={13} strokeWidth={1.8} className="text-white/40" />
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <kbd className="ml-4 rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-mono text-white/30">{shortcut}</kbd>}
    </button>
  )
}

// ─── Icon button ──────────────────────────────────────────────────────────────

function IconBtn({
  onClick, label, active = false, children,
}: {
  onClick: () => void; label: string; active?: boolean; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={[
        'flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-100 focus:outline-none',
        active
          ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/40'
          : 'text-white/50 hover:bg-white/8 hover:text-white/80',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
