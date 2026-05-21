'use client'

import React from 'react'
import { useFreeformStore } from '../store'

const DRAWING_TOOLS = new Set(['pen', 'brush', 'pencil', 'eraser'])

export function ToolSettingsPanel() {
  const {
    activeToolId,
    brushSize,
    brushOpacity,
    brushHardness,
    brushColor,
    setBrushSize,
    setBrushOpacity,
    setBrushHardness,
  } = useFreeformStore()

  if (!DRAWING_TOOLS.has(activeToolId)) return null

  const isEraser = activeToolId === 'eraser'
  const previewColor = isEraser ? '#e5e7eb' : brushColor

  return (
    <div
      className="fixed left-[68px] top-1/2 z-50 -translate-y-1/2 rounded-2xl border border-white/10 bg-black/75 p-4 shadow-2xl backdrop-blur-xl"
      style={{ width: 200 }}
    >
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
        {activeToolId.charAt(0).toUpperCase() + activeToolId.slice(1)}
      </p>

      {/* Brush preview circle */}
      <div className="mb-4 flex items-center justify-center rounded-xl bg-white/5 py-4">
        <div
          className="rounded-full"
          style={{
            width: Math.min(brushSize, 72),
            height: Math.min(brushSize, 72),
            background: previewColor,
            opacity: brushOpacity,
            boxShadow: `0 0 ${brushSize * 0.3}px ${previewColor}40`,
          }}
        />
      </div>

      <SliderRow
        label="Size"
        value={brushSize}
        min={1}
        max={120}
        step={1}
        display={`${brushSize}px`}
        onChange={setBrushSize}
      />

      {!isEraser && (
        <>
          <SliderRow
            label="Opacity"
            value={Math.round(brushOpacity * 100)}
            min={1}
            max={100}
            step={1}
            display={`${Math.round(brushOpacity * 100)}%`}
            onChange={(v) => setBrushOpacity(v / 100)}
          />
          <SliderRow
            label="Hardness"
            value={Math.round(brushHardness * 100)}
            min={0}
            max={100}
            step={1}
            display={`${Math.round(brushHardness * 100)}%`}
            onChange={(v) => setBrushHardness(v / 100)}
          />
        </>
      )}
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
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-white/50">{label}</span>
        <span className="font-mono text-[11px] text-white/35">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
    </div>
  )
}
