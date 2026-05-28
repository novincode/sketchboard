'use client'

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type PopoverSide = 'top' | 'bottom' | 'left' | 'right'
export type PopoverAlign = 'start' | 'center' | 'end'

/**
 * Reusable smart popover.
 *
 * Anchored to a DOMRect; positions itself so it stays inside the viewport
 * with an 8px margin. Side selection:
 *   - `preferredSide` first
 *   - if that side doesn't have enough room, falls back through the
 *     other 3 sides in clockwise order
 *   - if no side fits, picks the side with the most available space and
 *     allows scrolling inside the content
 *
 * Use this anywhere a small floating panel attaches to a button — color
 * pickers, mini menus, etc. Previously each call site reimplemented its
 * own positioning math (Swatch in VectorStylePanel, ColorChip in toolDefs,
 * PickerPopup in LayerPanel, …) which is exactly the "we should make a
 * more reusable component" the user asked for. Same component everywhere
 * keeps the visual + behavioral language consistent.
 */
export function AutoPopover({
  anchorRect, open, onClose,
  width = 240, gap = 6,
  preferredSide = 'auto', align = 'start',
  zIndex = 10100,
  children,
}: {
  anchorRect: DOMRect | null
  open: boolean
  onClose: () => void
  width?: number
  gap?: number
  /**
   * Preferred opening side. 'auto' picks the side with the most room.
   * Falls back through other sides clockwise if the preferred doesn't fit.
   */
  preferredSide?: PopoverSide | 'auto'
  /** Cross-axis alignment relative to the anchor. */
  align?: PopoverAlign
  zIndex?: number
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; side: PopoverSide } | null>(null)

  // Recompute position whenever the anchor or content size changes.
  useLayoutEffect(() => {
    if (!open || !anchorRect) { setPos(null); return }
    const compute = () => {
      const el = ref.current
      const W = el?.offsetWidth ?? width
      const H = el?.offsetHeight ?? 280
      const vw = window.innerWidth, vh = window.innerHeight
      const margin = 8

      // How much room each side actually has.
      const room: Record<PopoverSide, number> = {
        top:    anchorRect.top,
        bottom: vh - anchorRect.bottom,
        left:   anchorRect.left,
        right:  vw - anchorRect.right,
      }
      const need: Record<PopoverSide, number> = { top: H + gap, bottom: H + gap, left: W + gap, right: W + gap }

      // Side fallback order. Clockwise from preferred.
      const clockwise: PopoverSide[] = ['bottom', 'left', 'top', 'right']
      let order: PopoverSide[]
      if (preferredSide === 'auto') {
        order = (['bottom', 'top', 'left', 'right'] as PopoverSide[])
          .sort((a, b) => room[b] - room[a])
      } else {
        const i = clockwise.indexOf(preferredSide)
        order = [preferredSide, ...clockwise.slice(i + 1), ...clockwise.slice(0, i)]
      }
      let chosen: PopoverSide = order.find((s) => room[s] >= need[s]) ?? order.sort((a, b) => room[b] - room[a])[0]!

      // Place on the chosen side, then clamp the cross-axis offset.
      let left = 0, top = 0
      if (chosen === 'bottom' || chosen === 'top') {
        // Horizontal alignment to anchor.
        if (align === 'start')      left = anchorRect.left
        else if (align === 'end')   left = anchorRect.right - W
        else                        left = anchorRect.left + anchorRect.width / 2 - W / 2
        top = chosen === 'bottom' ? anchorRect.bottom + gap : anchorRect.top - H - gap
      } else {
        // Vertical alignment to anchor.
        if (align === 'start')      top = anchorRect.top
        else if (align === 'end')   top = anchorRect.bottom - H
        else                        top = anchorRect.top + anchorRect.height / 2 - H / 2
        left = chosen === 'right' ? anchorRect.right + gap : anchorRect.left - W - gap
      }
      left = Math.max(margin, Math.min(vw - W - margin, left))
      top  = Math.max(margin, Math.min(vh - H - margin, top))
      setPos({ left, top, side: chosen })
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [open, anchorRect, width, gap, preferredSide, align])

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || !anchorRect || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={ref}
      className="fixed rounded-2xl border border-white/10 bg-[#1a1a1a]/95 p-3 shadow-2xl backdrop-blur-xl"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width,
        zIndex,
        visibility: pos ? 'visible' : 'hidden',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}
