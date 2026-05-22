'use client'

import React, { useEffect, useRef } from 'react'
import { useFreeformStore } from '../store'

const SIZE = 96           // diameter of loupe
const ZOOM = 9            // magnification factor
const CAPTURE = Math.ceil(SIZE / ZOOM)  // source pixel count

export function EyedropperMagnifier() {
  const board = useFreeformStore((s) => s.board)
  const activeToolId = useFreeformStore((s) => s.activeToolId)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hexRef = useRef<HTMLSpanElement>(null)
  const swatchRef = useRef<HTMLSpanElement>(null)
  const posRef = useRef({ x: -999, y: -999 })
  const rafRef = useRef<number | null>(null)

  const isActive = activeToolId === 'eyedropper'

  useEffect(() => {
    if (!board || !isActive) return
    const el = board.canvas.parentElement
    if (!el) return

    const render = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      const { x, y } = posRef.current
      if (x < 0) return

      // Position loupe: follow pointer, biased above-right, clamped to viewport
      const margin = 16
      let lx = x + 24
      let ly = y - SIZE / 2
      if (lx + SIZE > window.innerWidth - margin)  lx = x - SIZE - 24
      if (ly < margin)                              ly = margin
      if (ly + SIZE > window.innerHeight - margin)  ly = window.innerHeight - SIZE - margin
      container.style.left = `${lx}px`
      container.style.top  = `${ly}px`

      const dpr = window.devicePixelRatio ?? 1
      const boardCanvas = board.canvas
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const physX = Math.round(x * dpr)
      const physY = Math.round(y * dpr)
      const physCapture = Math.round(CAPTURE * dpr)

      // Draw magnified region
      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.save()
      ctx.beginPath()
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(
        boardCanvas,
        physX - physCapture / 2, physY - physCapture / 2,
        physCapture, physCapture,
        0, 0, SIZE, SIZE,
      )
      ctx.restore()

      // Pixel grid lines — subtle, 1px
      const cellPx = SIZE / CAPTURE
      ctx.save()
      ctx.beginPath()
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'
      ctx.lineWidth = 0.5
      for (let i = 0; i <= CAPTURE; i++) {
        const p = i * cellPx
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, SIZE); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(SIZE, p); ctx.stroke()
      }
      ctx.restore()

      // Center cell highlight
      const cx = SIZE / 2 - cellPx / 2
      const cy = SIZE / 2 - cellPx / 2
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(cx, cy, cellPx, cellPx)

      // Sample the center pixel color
      const px = ctx.getImageData(SIZE / 2, SIZE / 2, 1, 1).data
      const hex = '#' + [px[0]!, px[1]!, px[2]!].map((c) => c.toString(16).padStart(2, '0')).join('')
      if (hexRef.current) hexRef.current.textContent = hex.toUpperCase()
      if (swatchRef.current) swatchRef.current.style.backgroundColor = hex
    }

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      posRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      if (containerRef.current) containerRef.current.style.display = 'flex'
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(render)
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
      className="pointer-events-none fixed z-200 flex flex-col items-center gap-1.5"
      style={{ display: 'none', width: SIZE }}
    >
      {/* Loupe */}
      <div
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: '50%',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(0,0,0,0.3)',
        }}
      >
        <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ display: 'block' }} />
      </div>

      {/* Hex label */}
      <div className="flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1 backdrop-blur-sm border border-white/10">
        <span
          ref={swatchRef}
          className="inline-block h-2.5 w-2.5 rounded-sm border border-white/20"
        />
        <span ref={hexRef} className="font-mono text-[11px] text-white/75 tracking-wider">#000000</span>
      </div>
    </div>
  )
}
