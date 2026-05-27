'use client'

import React, { useEffect, useState } from 'react'
import { Copy, Scissors, ClipboardPaste, Trash2, SquareDashed } from 'lucide-react'
import type { SelectTool } from '@sketchboard/core'
import { useFreeformStore } from '../store'
import { ContextMenu } from './ContextMenu'

/**
 * Right-click / long-press context menu over the drawing canvas.
 *
 * Re-uses the exact same SelectTool methods (`copySelected`, `cutSelected`,
 * `pasteClipboard`, `deleteSelected`) that the Cmd/Ctrl+C/X/V/Backspace
 * keyboard shortcuts call — no duplicate logic, no separate clipboard.
 *
 * The menu only opens when there's something to act on (a SelectTool selection
 * or a non-empty clipboard for paste). Otherwise the native browser menu is
 * preempted but no menu is shown.
 */
export function CanvasContextMenu() {
  const board = useFreeformStore((s) => s.board)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!board) return
    const el = board.canvas.parentElement
    if (!el) return

    const open = (clientX: number, clientY: number) => {
      const select = board.getTool<SelectTool>('select')
      if (!select) return
      if (!select.hasSelection() && !select.hasClipboard()) return
      setMenu({ x: clientX, y: clientY })
    }

    const onCtx = (e: MouseEvent) => {
      e.preventDefault()
      open(e.clientX, e.clientY)
    }

    // Long-press for touch (pen/touch). 500ms with movement cancel.
    let longPressTimer: ReturnType<typeof setTimeout> | null = null
    let downX = 0, downY = 0
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return // mouse uses contextmenu event
      if (e.button !== 0) return
      downX = e.clientX; downY = e.clientY
      longPressTimer = setTimeout(() => open(e.clientX, e.clientY), 500)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!longPressTimer) return
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) {
        clearTimeout(longPressTimer); longPressTimer = null
      }
    }
    const cancelLongPress = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
    }

    el.addEventListener('contextmenu', onCtx)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', cancelLongPress)
    el.addEventListener('pointercancel', cancelLongPress)
    el.addEventListener('pointerleave', cancelLongPress)
    return () => {
      el.removeEventListener('contextmenu', onCtx)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', cancelLongPress)
      el.removeEventListener('pointercancel', cancelLongPress)
      el.removeEventListener('pointerleave', cancelLongPress)
      cancelLongPress()
    }
  }, [board])

  if (!menu || !board) return null

  const select = board.getTool<SelectTool>('select')
  const hasSelection = select?.hasSelection() ?? false
  const hasClipboard = select?.hasClipboard() ?? false

  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      onClose={() => setMenu(null)}
      entries={[
        { label: 'Cut',   icon: <Scissors size={13} />,        shortcut: '⌘X', disabled: !hasSelection, onClick: () => select?.cutSelected() },
        { label: 'Copy',  icon: <Copy size={13} />,            shortcut: '⌘C', disabled: !hasSelection, onClick: () => select?.copySelected() },
        { label: 'Paste', icon: <ClipboardPaste size={13} />,  shortcut: '⌘V', disabled: !hasClipboard, onClick: () => select?.pasteClipboard() },
        { separator: true as const },
        { label: 'Deselect', icon: <SquareDashed size={13} />, shortcut: 'Esc', disabled: !hasSelection, onClick: () => select?.deselect() },
        { label: 'Delete',   icon: <Trash2 size={13} />,       shortcut: '⌫',   danger: true, disabled: !hasSelection, onClick: () => select?.deleteSelected() },
      ]}
    />
  )
}
