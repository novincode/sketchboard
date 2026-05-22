'use client'

import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuAction {
  label: string
  icon?: React.ReactNode
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

export type ContextMenuEntry = ContextMenuAction | { separator: true }

interface Props {
  x: number
  y: number
  entries: ContextMenuEntry[]
  onClose: () => void
}

export function ContextMenu({ x, y, entries, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // Use capture so we run before anything else
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Keep menu on screen
  const MENU_W = 192
  const ITEM_H = 32
  const menuH = entries.length * ITEM_H + 12
  const sx = Math.min(x, window.innerWidth - MENU_W - 8)
  const sy = Math.min(y, window.innerHeight - menuH - 8)

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] w-48 rounded-xl border border-white/10 bg-[#161616]/95 py-1.5 shadow-2xl backdrop-blur-xl"
      style={{ left: sx, top: sy }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) => {
        if ('separator' in entry) {
          return <div key={i} className="my-1 mx-2 h-px bg-white/8" />
        }
        return (
          <button
            key={i}
            disabled={entry.disabled}
            onClick={() => { entry.onClick(); onClose() }}
            className={[
              'flex w-full items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors',
              entry.danger
                ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                : entry.disabled
                ? 'cursor-default text-white/20'
                : 'text-white/70 hover:bg-white/8 hover:text-white',
            ].join(' ')}
          >
            {entry.icon && (
              <span className="shrink-0 w-4 opacity-55">{entry.icon}</span>
            )}
            <span className="flex-1 text-left">{entry.label}</span>
            {entry.shortcut && (
              <span className="text-[10px] text-white/20">{entry.shortcut}</span>
            )}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}

/** Hook to track right-click + long-press for mobile */
export function useContextMenu() {
  const [menu, setMenu] = React.useState<{ x: number; y: number } | null>(null)

  const open = React.useCallback((x: number, y: number) => setMenu({ x, y }), [])
  const close = React.useCallback(() => setMenu(null), [])

  const onContextMenu = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    open(e.clientX, e.clientY)
  }, [open])

  const longPressRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const onPointerDown = React.useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    longPressRef.current = setTimeout(() => {
      open(e.clientX, e.clientY)
    }, 500)
  }, [open])
  const cancelLongPress = React.useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current)
  }, [])

  return { menu, open, close, onContextMenu, onPointerDown, cancelLongPress }
}
