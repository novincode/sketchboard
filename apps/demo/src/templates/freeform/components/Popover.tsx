'use client'

import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface PopoverProps {
  anchorRect: DOMRect | null
  onClose: () => void
  children: React.ReactNode
  align?: 'left' | 'right' | 'center'
  width?: number
}

export function Popover({ anchorRect, onClose, children, align = 'left', width = 208 }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!anchorRect || typeof document === 'undefined') return null

  const GAP = 6
  const vw = window.innerWidth
  const vh = window.innerHeight

  let left: number
  if (align === 'right') {
    left = anchorRect.right - width
  } else if (align === 'center') {
    left = anchorRect.left + anchorRect.width / 2 - width / 2
  } else {
    left = anchorRect.left
  }
  left = Math.max(8, Math.min(vw - width - 8, left))

  const spaceBelow = vh - anchorRect.bottom
  const flipsUp = spaceBelow < 120
  const top = flipsUp ? anchorRect.top - GAP : anchorRect.bottom + GAP

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999]"
      style={{
        left,
        top,
        width,
        transform: flipsUp ? 'translateY(-100%)' : undefined,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}
