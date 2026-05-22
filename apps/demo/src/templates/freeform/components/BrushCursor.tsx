'use client'

import React, { useEffect, useRef } from 'react'
import { useFreeformStore } from '../store'

/**
 * Zero-React-rerender cursor overlay.
 * Position is updated via direct DOM writes on pointermove.
 * Size/shape only update via effects when tool or brush settings change.
 */
export function BrushCursor() {
  const board = useFreeformStore((s) => s.board)
  const cursorRef = useRef<HTMLDivElement>(null)

  // Refs to hold latest values without triggering re-renders
  const toolRef    = useRef(useFreeformStore.getState().activeToolId)
  const brushRef   = useRef(useFreeformStore.getState().brushSize)
  const eraserRef  = useRef(useFreeformStore.getState().eraserSize)
  const vectorRef  = useRef(useFreeformStore.getState().vectorSize)
  const zoomRef    = useRef(1)

  // Keep refs in sync whenever store changes
  useEffect(() =>
    useFreeformStore.subscribe((s) => {
      toolRef.current   = s.activeToolId
      brushRef.current  = s.brushSize
      eraserRef.current = s.eraserSize
      vectorRef.current = s.vectorSize
      applyStyle(cursorRef.current, toolRef.current, brushRef.current, eraserRef.current, vectorRef.current, zoomRef.current)
    }),
  [])

  // Hot-path: position via direct DOM writes — no React renders
  useEffect(() => {
    const el = board?.canvas.parentElement
    const cursor = cursorRef.current
    if (!el || !cursor) return

    const onMove = (e: PointerEvent) => {
      cursor.style.left = `${e.clientX}px`
      cursor.style.top  = `${e.clientY}px`
      cursor.style.display = ''
      applyStyle(cursor, toolRef.current, brushRef.current, eraserRef.current, vectorRef.current, zoomRef.current)
    }
    const onLeave = () => { cursor.style.display = 'none' }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)

    // Track zoom changes
    const unsub = board!.hooks.afterRender.tap('brush-cursor', () => {
      zoomRef.current = board!.camera.zoom
      applyStyle(cursor, toolRef.current, brushRef.current, eraserRef.current, vectorRef.current, zoomRef.current)
    })

    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      unsub()
    }
  }, [board])

  if (!board) return null

  return (
    <div
      ref={cursorRef}
      aria-hidden
      className="pointer-events-none fixed z-200"
      style={{ display: 'none', transform: 'translate(-50%,-50%)', position: 'fixed' }}
    />
  )
}

function applyStyle(
  el: HTMLDivElement | null,
  tool: string,
  brushSize: number,
  eraserSize: number,
  vectorSize: number,
  zoom: number,
): void {
  if (!el) return

  if (tool === 'vectorpen') {
    // Small dot for pen anchor placement
    el.style.width  = '8px'
    el.style.height = '8px'
    el.style.borderRadius  = '50%'
    el.style.border  = '2px solid rgba(99,179,237,0.9)'
    el.style.background    = 'rgba(99,179,237,0.2)'
    el.style.boxShadow     = ''
    el.style.mixBlendMode  = ''
    return
  }

  if (['pen', 'brush', 'eraser', 'vector'].includes(tool)) {
    let size: number
    if (tool === 'eraser') size = Math.max(4, eraserSize * zoom)
    else if (tool === 'vector') size = Math.max(4, vectorSize * zoom)
    else size = Math.max(4, brushSize * zoom)

    el.style.width  = `${size}px`
    el.style.height = `${size}px`
    el.style.borderRadius = '50%'
    el.style.border = tool === 'eraser'
      ? '1.5px solid rgba(255,255,255,0.6)'
      : '1.5px solid rgba(255,255,255,0.85)'
    el.style.background   = 'transparent'
    el.style.boxShadow    = ''
    el.style.mixBlendMode = 'difference'
    return
  }

  // No custom cursor for select/pan/eyedropper — hide
  el.style.display = 'none'
}
