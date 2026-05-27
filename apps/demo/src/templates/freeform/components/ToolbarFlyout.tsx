'use client'

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import type { ToolId } from '../types'
import { TOOL_DEFS } from '../toolDefs'

export type FlyoutSide = 'bottom' | 'top' | 'left' | 'right'

/**
 * Figma / Photoshop-style tool flyout submenu.
 *
 * Renders next to the toolbar slot's anchor (the ToolButton's DOM rect)
 * and opens *away* from the toolbar edge — so a bottom-docked toolbar's
 * flyout opens upward, a left-docked one opens to the right, etc. One
 * tool per line; click selects + closes; the currently-active sibling is
 * marked with a check. Per-tool keyboard shortcuts shown on the right.
 *
 * Anchored via fixed positioning (portal'd to body) so the flyout never
 * gets clipped by the toolbar's overflow:hidden ancestors.
 */
export function ToolbarFlyout({
  anchorRect, ids, activeId, toolbarSide, shortcuts, onPick, onClose,
}: {
  anchorRect: DOMRect | null
  ids: ToolId[]
  activeId: ToolId
  /** Which edge the toolbar is docked to — flyout opens away from it. */
  toolbarSide: FlyoutSide
  /** Optional per-tool shortcut hints rendered on the right of each row. */
  shortcuts?: Partial<Record<ToolId, string>>
  onPick: (id: ToolId) => void
  onClose: () => void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Reposition on mount + on window resize.
  useLayoutEffect(() => {
    if (!anchorRect) { setPos(null); return }
    const compute = () => {
      const W = popoverRef.current?.offsetWidth ?? 220
      const H = popoverRef.current?.offsetHeight ?? Math.max(48, ids.length * 36 + 16)
      const GAP = 10
      let left = 0, top = 0
      switch (toolbarSide) {
        case 'bottom':  // toolbar at bottom → flyout above the slot
          left = anchorRect.left + anchorRect.width / 2 - W / 2
          top  = anchorRect.top - H - GAP
          break
        case 'top':     // toolbar at top → flyout below
          left = anchorRect.left + anchorRect.width / 2 - W / 2
          top  = anchorRect.bottom + GAP
          break
        case 'left':    // toolbar on left → flyout to the right
          left = anchorRect.right + GAP
          top  = anchorRect.top + anchorRect.height / 2 - H / 2
          break
        case 'right':   // toolbar on right → flyout to the left
          left = anchorRect.left - W - GAP
          top  = anchorRect.top + anchorRect.height / 2 - H / 2
          break
      }
      // Clamp to viewport with 8px margin.
      const vw = window.innerWidth, vh = window.innerHeight
      left = Math.max(8, Math.min(vw - W - 8, left))
      top  = Math.max(8, Math.min(vh - H - 8, top))
      setPos({ left, top })
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [anchorRect, ids.length, toolbarSide])

  // Click outside or Escape closes.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!anchorRect) return null

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[10001] flex min-w-[200px] flex-col rounded-2xl border border-white/10 bg-[#1a1a1a]/96 p-1.5 shadow-2xl backdrop-blur-2xl select-none toolbar-flyout-enter"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <style>{`
        .toolbar-flyout-enter {
          animation: toolbarFlyoutIn 140ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes toolbarFlyoutIn {
          from { opacity: 0; transform: translateY(4px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div className="px-2 pt-1.5 pb-1 text-[9px] font-semibold uppercase tracking-widest text-white/35">
        Tools
      </div>
      {ids.map((id) => {
        const def = TOOL_DEFS[id]
        if (!def) return null
        const Icon = def.Icon
        const isActive = id === activeId
        return (
          <button
            key={id}
            onClick={() => { onPick(id); onClose() }}
            className={[
              'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
              isActive
                ? 'bg-white/12 text-white'
                : 'text-white/70 hover:bg-white/8 hover:text-white/95',
            ].join(' ')}
          >
            <span className={[
              'flex h-5 w-5 items-center justify-center shrink-0',
              isActive ? 'text-blue-300' : 'text-white/55',
            ].join(' ')}>
              <Icon size={15} strokeWidth={1.75} />
            </span>
            <span className="flex-1 text-[12px] font-medium">{def.label}</span>
            {shortcuts?.[id] && (
              <kbd className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-mono text-white/40 shrink-0">
                {shortcuts[id]}
              </kbd>
            )}
            {isActive && (
              <Check size={12} className="text-blue-300 shrink-0" />
            )}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
