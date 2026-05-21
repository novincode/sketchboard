'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useFreeformStore } from '../store'

const DRAWING_TOOLS = new Set(['pen', 'brush', 'pencil', 'eraser'])

export function BrushCursor() {
  const { board, brushSize, activeToolId } = useFreeformStore()
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const rafRef = useRef<number | null>(null)

  // Track pointer position on the canvas container
  useEffect(() => {
    const el = board?.canvas.parentElement
    if (!el) return

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    const onLeave = () => setPos(null)

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [board])

  // Track camera zoom via afterRender hook (fires every rendered frame)
  useEffect(() => {
    if (!board) return
    const unsub = board.hooks.afterRender.tap('brush-cursor', () => {
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        setZoom(board.camera.zoom)
        rafRef.current = null
      })
    })
    return () => {
      unsub()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [board])

  if (!pos || !board || !DRAWING_TOOLS.has(activeToolId)) return null

  // Convert world-unit brush size to screen pixels
  const screenDiameter = Math.max(4, brushSize * zoom)

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[200]"
      style={{
        left: pos.x + (board.canvas.parentElement?.getBoundingClientRect().left ?? 0),
        top: pos.y + (board.canvas.parentElement?.getBoundingClientRect().top ?? 0),
        width: screenDiameter,
        height: screenDiameter,
        transform: 'translate(-50%, -50%)',
        border: '1.5px solid rgba(255,255,255,0.8)',
        borderRadius: '50%',
        mixBlendMode: 'difference',
      }}
    />
  )
}
