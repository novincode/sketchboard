'use client'

import React, { useEffect, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { useFreeformStore } from '../store'

// ─── Color conversion helpers ─────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let { r, g, b } = hexToRgb(hex)
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = h / 360, ss = s / 100, ll = l / 100
  let r, g, b
  if (ss === 0) { r = g = b = ll } else {
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
    const p = 2 * ll - q
    const hue2rgb = (t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    r = hue2rgb(hh + 1/3); g = hue2rgb(hh); b = hue2rgb(hh - 1/3)
  }
  return rgbToHex(r * 255, g * 255, b * 255)
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESETS = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
  '#ec4899', '#6b7280', '#1e293b', '#e2e8f0',
]

const EDGE_MARGIN = 12
const TOP_BAR_H = 52
const TOOLBAR_CROSS = 52
const PICKER_W = 214
const PICKER_H = 340

type ColorFormat = 'hex' | 'rgb' | 'hsl'

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
  const rawTop = offset * vh
  const top = Math.max(halfH + EDGE_MARGIN, Math.min(vh - halfH - EDGE_MARGIN, rawTop))
  return { position: 'fixed', right: EDGE_MARGIN + TOOLBAR_CROSS + 8, top, transform: 'translateY(-50%)' }
}

// ─── ColorPickerPopup ─────────────────────────────────────────────────────────

export function ColorPickerPopup() {
  const { brushColor, setBrushColor, closePanels, toolbarSnap, toolbarEdgeOffset } = useFreeformStore()
  const ref = useRef<HTMLDivElement>(null)
  const [format, setFormat] = useState<ColorFormat>('hex')

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closePanels()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [closePanels])

  const rgb = hexToRgb(brushColor)
  const hsl = hexToHsl(brushColor)

  return (
    <div
      ref={ref}
      className="z-50 rounded-2xl border border-white/10 bg-black/88 p-3.5 shadow-2xl backdrop-blur-xl"
      style={{ ...pickerStyle(toolbarSnap, toolbarEdgeOffset), width: PICKER_W }}
    >
      {/* Color wheel — always shown */}
      <HexColorPicker color={brushColor} onChange={setBrushColor} style={{ width: '100%', height: 160 }} />

      {/* Format tabs */}
      <div className="mt-3 flex rounded-lg overflow-hidden border border-white/10 bg-white/5">
        {(['hex', 'rgb', 'hsl'] as ColorFormat[]).map((f) => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            className={[
              'flex-1 py-1 text-[10px] uppercase tracking-widest font-semibold transition-colors',
              format === f ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/60',
            ].join(' ')}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Format-specific inputs */}
      <div className="mt-2">
        {format === 'hex' && (
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
            <span className="text-xs text-white/25 font-mono">#</span>
            <input
              value={brushColor.replace('#', '').toUpperCase()}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
                if (v.length === 6) setBrushColor('#' + v)
              }}
              className="w-full bg-transparent font-mono text-xs text-white/70 outline-none uppercase"
              maxLength={6}
              spellCheck={false}
            />
          </div>
        )}

        {format === 'rgb' && (
          <div className="flex gap-1.5">
            {(['r', 'g', 'b'] as const).map((ch) => (
              <RgbChannel
                key={ch}
                label={ch.toUpperCase()}
                value={rgb[ch]}
                onChange={(v) => setBrushColor(rgbToHex(
                  ch === 'r' ? v : rgb.r,
                  ch === 'g' ? v : rgb.g,
                  ch === 'b' ? v : rgb.b,
                ))}
              />
            ))}
          </div>
        )}

        {format === 'hsl' && (
          <div className="flex gap-1.5">
            <HslChannel label="H" value={hsl.h} max={360} unit="°"
              onChange={(v) => setBrushColor(hslToHex(v, hsl.s, hsl.l))} />
            <HslChannel label="S" value={hsl.s} max={100} unit="%"
              onChange={(v) => setBrushColor(hslToHex(hsl.h, v, hsl.l))} />
            <HslChannel label="L" value={hsl.l} max={100} unit="%"
              onChange={(v) => setBrushColor(hslToHex(hsl.h, hsl.s, v))} />
          </div>
        )}
      </div>

      {/* Presets */}
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

// ─── Channel inputs ───────────────────────────────────────────────────────────

function RgbChannel({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  return (
    <div className="flex-1 flex flex-col items-center gap-0.5">
      <span className="text-[8px] uppercase tracking-widest text-white/25 font-semibold">{label}</span>
      <input
        className="w-full rounded-lg border border-white/10 bg-white/5 text-center font-mono text-xs text-white/70 outline-none py-1"
        value={editing ? draft : String(value)}
        onFocus={() => { setDraft(String(value)); setEditing(true) }}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
        onBlur={() => { const n = parseInt(draft); if (!isNaN(n)) onChange(Math.max(0, Math.min(255, n))); setEditing(false) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { const n = parseInt(draft); if (!isNaN(n)) onChange(Math.max(0, Math.min(255, n))); setEditing(false) } e.stopPropagation() }}
      />
    </div>
  )
}

function HslChannel({ label, value, max, unit, onChange }: { label: string; value: number; max: number; unit: string; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  return (
    <div className="flex-1 flex flex-col items-center gap-0.5">
      <span className="text-[8px] uppercase tracking-widest text-white/25 font-semibold">{label}</span>
      <input
        className="w-full rounded-lg border border-white/10 bg-white/5 text-center font-mono text-xs text-white/70 outline-none py-1"
        value={editing ? draft : `${value}${unit}`}
        onFocus={() => { setDraft(String(value)); setEditing(true) }}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
        onBlur={() => { const n = parseInt(draft); if (!isNaN(n)) onChange(Math.max(0, Math.min(max, n))); setEditing(false) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { const n = parseInt(draft); if (!isNaN(n)) onChange(Math.max(0, Math.min(max, n))); setEditing(false) } e.stopPropagation() }}
      />
    </div>
  )
}
