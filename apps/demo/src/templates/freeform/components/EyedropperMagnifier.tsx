'use client'

import React, { useEffect, useRef } from 'react'
import { useFreeformStore } from '../store'

const MAGNIFIER_SIZE = 120   // diameter of the magnifier circle
const ZOOM_FACTOR = 8        // how many times to magnify
const CAPTURE_SIZE = Math.ceil(MAGNIFIER_SIZE / ZOOM_FACTOR)  // source pixels to sample

export function EyedropperMagnifier() {
  const board = useFreeformStore((s) => s.board)
  const activeToolId = useFreeformStore((s) => s.activeToolId)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const posRef = useRef({ x: -999, y: -999 })
  const rafRef = useRef<number | null>(null)

  const isActive = activeToolId === 'eyedropper'

  useEffect(() => {
    if (!board || !isActive) return
    const el = board.canvas.parentElement
    if (!el) return

    const renderMagnifier = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      const { x, y } = posRef.current
      if (x < 0) return

      container.style.left = `${x + 24}px`
      container.style.top = `${y - MAGNIFIER_SIZE / 2}px`

      const dpr = window.devicePixelRatio ?? 1
      const boardCanvas = board.canvas
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const physX = Math.round(x * dpr)
      const physY = Math.round(y * dpr)
      const physCapture = Math.round(CAPTURE_SIZE * dpr)

      // Clear with a neutral background
      ctx.clearRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE)

      // Clip to circle
      ctx.save()
      ctx.beginPath()
      ctx.arc(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE / 2, 0, Math.PI * 2)
      ctx.clip()

      // Draw the magnified region
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(
        boardCanvas,
        physX - physCapture / 2, physY - physCapture / 2,
        physCapture, physCapture,
        0, 0,
        MAGNIFIER_SIZE, MAGNIFIER_SIZE,
      )
      ctx.restore()

      // Crosshair
      const cx = MAGNIFIER_SIZE / 2
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx - 8, cx); ctx.lineTo(cx + 8, cx)
      ctx.moveTo(cx, cx - 8); ctx.lineTo(cx, cx + 8)
      ctx.stroke()

      // Outer ring
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx, cx, MAGNIFIER_SIZE / 2 - 1, 0, Math.PI * 2)
      ctx.stroke()

      // Center pixel highlight
      const centerPixelSize = ZOOM_FACTOR
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 1
      ctx.strokeRect(
        cx - centerPixelSize / 2, cx - centerPixelSize / 2,
        centerPixelSize, centerPixelSize,
      )
    }

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      posRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      if (containerRef.current) containerRef.current.style.display = 'block'
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(renderMagnifier)
    }

    const onLeave = () => {
      if (containerRef.current) containerRef.current.style.display = 'none'
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [board, isActive])

  if (!board || !isActive) return null

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed z-200"
      style={{
        display: 'none',
        width: MAGNIFIER_SIZE,
        height: MAGNIFIER_SIZE,
        borderRadius: '50%',
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.15)',
      }}
    >
      <canvas
        ref={canvasRef}
        width={MAGNIFIER_SIZE}
        height={MAGNIFIER_SIZE}
        style={{ display: 'block' }}
      />
    </div>
  )
}
