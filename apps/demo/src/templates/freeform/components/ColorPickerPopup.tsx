'use client'

import React, { useEffect, useRef } from 'react'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { useFreeformStore } from '../store'

const PRESETS = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
  '#ec4899', '#6b7280', '#1e293b', '#e2e8f0',
]

// Mirror toolbar constants so the picker opens right beside the toolbar
const EDGE_MARGIN = 12
const TOP_BAR_H = 52
const TOOLBAR_CROSS = 52
const PICKER_W = 200
const PICKER_H = 290

function pickerStyle(
  snap: 'bottom' | 'top' | 'left' | 'right',
  offset: number,
): React.CSSProperties {
  if (typeof window === 'undefined') return { position: 'fixed', right: 3, top: 56 }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const halfW = PICKER_W / 2
  const halfH = PICKER_H / 2

  if (snap === 'bottom') {
    const rawLeft = offset * vw
    const left = Math.max(halfW + EDGE_MARGIN, Math.min(vw - halfW - EDGE_MARGIN, rawLeft))
    return { position: 'fixed', bottom: EDGE_MARGIN + TOOLBAR_CROSS + 8, left, transform: 'translateX(-50%)' }
  }
  if (snap === 'top') {
    const rawLeft = offset * vw
    const left = Math.max(halfW + EDGE_MARGIN, Math.min(vw - halfW - EDGE_MARGIN, rawLeft))
    return { position: 'fixed', top: TOP_BAR_H + EDGE_MARGIN + TOOLBAR_CROSS + 8, left, transform: 'translateX(-50%)' }
  }
  if (snap === 'left') {
    const rawTop = offset * vh
    const top = Math.max(halfH + EDGE_MARGIN, Math.min(vh - halfH - EDGE_MARGIN, rawTop))
    return { position: 'fixed', left: EDGE_MARGIN + TOOLBAR_CROSS + 8, top, transform: 'translateY(-50%)' }
  }
  // right
  const rawTop = offset * vh
  const top = Math.max(halfH + EDGE_MARGIN, Math.min(vh - halfH - EDGE_MARGIN, rawTop))
  return { position: 'fixed', right: EDGE_MARGIN + TOOLBAR_CROSS + 8, top, transform: 'translateY(-50%)' }
}

export function ColorPickerPopup() {
  const { brushColor, setBrushColor, closePanels, toolbarSnap, toolbarEdgeOffset } = useFreeformStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closePanels()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [closePanels])

  return (
    <div
      ref={ref}
      className="z-50 rounded-2xl border border-white/10 bg-black/85 p-4 shadow-2xl backdrop-blur-xl"
      style={{ ...pickerStyle(toolbarSnap, toolbarEdgeOffset), width: PICKER_W }}
    >
      <HexColorPicker color={brushColor} onChange={setBrushColor} style={{ width: '100%', height: 160 }} />

      <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
        <span className="text-xs text-white/25">#</span>
        <HexColorInput
          color={brushColor}
          onChange={setBrushColor}
          prefixed={false}
          className="w-full bg-transparent font-mono text-xs text-white/70 outline-none"
        />
      </div>

      <div className="mt-2.5 grid grid-cols-6 gap-1">
        {PRESETS.map((hex) => (
          <button
            key={hex}
            onClick={() => setBrushColor(hex)}
            title={hex}
            className="h-5 w-5 rounded-md transition-transform hover:scale-110 focus:outline-none"
            style={{
              background: hex,
              boxShadow: brushColor.toLowerCase() === hex.toLowerCase()
                ? '0 0 0 2px white'
                : '0 0 0 1px rgba(255,255,255,0.1)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
