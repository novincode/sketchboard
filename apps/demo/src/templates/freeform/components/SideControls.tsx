'use client'

import React, { useRef } from 'react'
import { useFreeformStore } from '../store'

/**
 * Right-side vertical sliders, Procreate-style.
 * Top slider = brush size, bottom slider = opacity.
 * Drag up = increase, drag down = decrease.
 */
export function SideControls() {
  const { brushSize, brushOpacity, setBrushSize, setBrushOpacity } = useFreeformStore()

  return (
    <div className="fixed right-3 top-1/2 z-50 flex -translate-y-1/2 flex-col items-center gap-3">
      <VerticalSlider
        value={brushSize}
        min={1}
        max={120}
        label="Size"
        displayValue={`${brushSize}`}
        accentColor="#4f8ef7"
        onChange={setBrushSize}
      />
      <VerticalSlider
        value={brushOpacity * 100}
        min={1}
        max={100}
        label="Opacity"
        displayValue={`${Math.round(brushOpacity * 100)}%`}
        accentColor="#a78bfa"
        onChange={(v) => setBrushOpacity(v / 100)}
      />
    </div>
  )
}

function VerticalSlider({
  value,
  min,
  max,
  label,
  displayValue,
  accentColor,
  onChange,
}: {
  value: number
  min: number
  max: number
  label: string
  displayValue: string
  accentColor: string
  onChange: (v: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const startY = useRef(0)
  const startValue = useRef(value)

  const update = (clientY: number) => {
    const height = trackRef.current?.clientHeight ?? 120
    const dy = startY.current - clientY
    const delta = (dy / height) * (max - min)
    const clamped = Math.max(min, Math.min(max, startValue.current + delta))
    onChange(Math.round(clamped))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    isDragging.current = true
    startY.current = e.clientY
    startValue.current = value
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return
    update(e.clientY)
  }

  const onPointerUp = () => {
    isDragging.current = false
  }

  const fillPct = ((value - min) / (max - min)) * 100

  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      {/* Track */}
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative flex h-32 w-8 cursor-ns-resize flex-col justify-end overflow-hidden rounded-full border border-white/10 bg-white/5 backdrop-blur-lg"
        title={label}
      >
        {/* Fill */}
        <div
          className="w-full rounded-full transition-none"
          style={{ height: `${fillPct}%`, background: accentColor, opacity: 0.8 }}
        />
      </div>

      {/* Value label */}
      <span className="text-center font-mono text-[9px] text-white/30 leading-tight">
        {displayValue}
      </span>
    </div>
  )
}
