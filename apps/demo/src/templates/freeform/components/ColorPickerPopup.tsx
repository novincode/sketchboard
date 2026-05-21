'use client'

import React, { useEffect, useRef } from 'react'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { useFreeformStore } from '../store'

const PRESETS = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
  '#ec4899', '#6b7280', '#1e293b', '#e2e8f0',
]

export function ColorPickerPopup() {
  const { brushColor, setBrushColor, closePanels } = useFreeformStore()
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
      className="fixed right-3 top-14 z-50 rounded-2xl border border-white/10 bg-black/85 p-4 shadow-2xl backdrop-blur-xl"
      style={{ width: 200 }}
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
