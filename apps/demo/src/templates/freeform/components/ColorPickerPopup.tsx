'use client'

import React, { useEffect, useRef } from 'react'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { useFreeformStore } from '../store'

export function ColorPickerPopup() {
  const { brushColor, setBrushColor, closePanels } = useFreeformStore()
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
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
      <p className="mb-3 text-xs font-medium uppercase tracking-widest text-white/30">Color</p>

      {/* react-colorful HSV wheel */}
      <HexColorPicker
        color={brushColor}
        onChange={setBrushColor}
        style={{ width: '100%', height: 180 }}
      />

      {/* Hex input */}
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
        <span className="text-xs text-white/30">#</span>
        <HexColorInput
          color={brushColor}
          onChange={setBrushColor}
          prefixed={false}
          className="w-full bg-transparent text-sm font-mono text-white/80 outline-none placeholder:text-white/20"
        />
      </div>

      {/* Preset swatches */}
      <div className="mt-3 grid grid-cols-8 gap-1.5">
        {PRESETS.map((hex) => (
          <button
            key={hex}
            onClick={() => setBrushColor(hex)}
            title={hex}
            className="h-5 w-5 rounded-md transition-transform hover:scale-110 focus:outline-none"
            style={{
              background: hex,
              boxShadow:
                brushColor.toLowerCase() === hex.toLowerCase()
                  ? '0 0 0 2px white'
                  : '0 0 0 1px rgba(255,255,255,0.1)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

const PRESETS = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
  '#ec4899', '#6b7280', '#1e293b', '#e2e8f0',
  '#0f172a', '#7c3aed', '#059669', '#dc2626',
]
