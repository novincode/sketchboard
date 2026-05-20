'use client'

import React, { useEffect, useRef } from 'react'
import { useFreeformStore } from '../store'

export function BrushPanel() {
  const {
    brushSize,
    brushOpacity,
    brushHardness,
    setBrushSize,
    setBrushOpacity,
    setBrushHardness,
    closePanels,
  } = useFreeformStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closePanels()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [closePanels])

  return (
    <div
      ref={ref}
      className="fixed left-20 top-1/2 z-50 -translate-y-1/2 rounded-2xl border border-white/10 bg-black/80 p-4 shadow-2xl backdrop-blur-xl"
      style={{ width: 220 }}
    >
      <p className="mb-4 text-xs font-medium uppercase tracking-widest text-white/30">Brush</p>

      <SliderRow
        label="Size"
        value={brushSize}
        min={1}
        max={120}
        step={1}
        onChange={setBrushSize}
        display={`${brushSize}px`}
      />
      <SliderRow
        label="Opacity"
        value={Math.round(brushOpacity * 100)}
        min={1}
        max={100}
        step={1}
        onChange={(v) => setBrushOpacity(v / 100)}
        display={`${Math.round(brushOpacity * 100)}%`}
      />
      <SliderRow
        label="Hardness"
        value={Math.round(brushHardness * 100)}
        min={0}
        max={100}
        step={1}
        onChange={(v) => setBrushHardness(v / 100)}
        display={`${Math.round(brushHardness * 100)}%`}
      />

      {/* Size preview */}
      <div className="mt-4 flex items-center justify-center rounded-xl bg-white/5 py-4">
        <div
          className="rounded-full bg-white/80"
          style={{
            width: Math.min(brushSize, 80),
            height: Math.min(brushSize, 80),
            opacity: brushOpacity,
          }}
        />
      </div>
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs text-white/50">{label}</span>
        <span className="font-mono text-xs text-white/40">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
        style={{ height: 4 }}
      />
    </div>
  )
}
