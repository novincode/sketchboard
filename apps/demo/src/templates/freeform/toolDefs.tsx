'use client'

/**
 * Central tool registry for the freeform template.
 *
 * Each ToolDef describes a single tool: its id, label, icon, and an optional
 * OptionsPanel component rendered in the TopBar when that tool is active.
 * OptionsPanels read directly from useFreeformStore — no prop-drilling needed.
 *
 * ToolSlots drive the Toolbar: each slot holds one or more sibling tools.
 * Shift+clicking the slot's toolbar button cycles through siblings.
 */

import React, { useEffect, useRef } from 'react'
import {
  MousePointer2, Lasso, Paintbrush, Pen, Eraser, PaintBucket,
  Spline, PenTool as PenToolIcon, Pipette, Hand,
  type LucideIcon,
} from 'lucide-react'

import type { ToolId, EraserMode } from './types'
import type { FillPlacement } from '@sketchboard/core'
import { useFreeformStore } from './store'
import { DraggableInput } from './components/DraggableInput'
import { RASTER_BRUSH_PRESETS } from './brushPresets'
import type { BrushPreset } from './brushPresets'

// ─── Core registry types ──────────────────────────────────────────────────────

export interface ToolDef {
  id: ToolId
  label: string
  Icon: LucideIcon
  /** Compact horizontal options panel rendered in the TopBar. Reads from store directly. */
  OptionsPanel: React.FC | null
}

/** A logical toolbar "slot" — one button, possibly cycling through siblings via Shift+click */
export interface ToolSlot {
  /** All tool ids in this group. First = default when none are active. */
  ids: [ToolId, ...ToolId[]]
  /** Primary keyboard shortcut key (without modifiers) */
  shortcut: string
}

// ─── Individual OptionsPanel components ───────────────────────────────────────

function RasterBrushOptionsPanel() {
  const {
    brushColor, brushSize, setBrushSize,
    brushOpacity, setBrushOpacity,
    brushHardness, setBrushHardness,
    activeToolId,
    activeBrushPresetId, setActiveBrushPreset,
  } = useFreeformStore()

  return (
    <div className="flex items-center gap-2">
      {/* Brush preset thumbnails */}
      <div className="flex gap-1">
        {RASTER_BRUSH_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => setActiveBrushPreset(preset.id)}
            title={preset.name}
            className={[
              'relative overflow-hidden rounded-lg border transition-all',
              activeBrushPresetId === preset.id
                ? 'border-blue-400/70 ring-1 ring-blue-400/30 scale-105'
                : 'border-white/12 hover:border-white/30',
            ].join(' ')}
            style={{ width: 48, height: 26 }}
          >
            <BrushPreviewCanvas preset={preset} color={brushColor} />
            <span className={[
              'absolute bottom-0 left-0 right-0 text-center leading-none py-0.5 text-[7px]',
              activeBrushPresetId === preset.id ? 'text-blue-300' : 'text-white/35',
            ].join(' ')}>{preset.name}</span>
          </button>
        ))}
      </div>
      <Sep />
      <DraggableInput label="Size" value={brushSize} min={1} max={200} unit="px" onChange={setBrushSize} />
      <Sep />
      <DraggableInput label="Opacity" value={Math.round(brushOpacity * 100)} min={1} max={100} unit="%" onChange={(v) => setBrushOpacity(v / 100)} />
      {activeToolId === 'brush' && (
        <>
          <Sep />
          <DraggableInput label="Hardness" value={Math.round(brushHardness * 100)} min={0} max={100} unit="%" onChange={(v) => setBrushHardness(v / 100)} />
        </>
      )}
    </div>
  )
}

function EraserOptionsPanel() {
  const { eraserSize, setEraserSize, eraserMode, setEraserMode } = useFreeformStore()
  return (
    <div className="flex items-center gap-2">
      <DraggableInput label="Size" value={eraserSize} min={1} max={400} unit="px" onChange={setEraserSize} />
      <Sep />
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-widest text-white/30 font-semibold">Mode</span>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {(['pixel', 'stroke'] as EraserMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setEraserMode(m)}
              className={[
                'px-2.5 py-1 text-[10px] capitalize transition-colors',
                eraserMode === m ? 'bg-white/20 text-white' : 'text-white/35 hover:bg-white/5',
              ].join(' ')}
            >{m}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

function FillOptionsPanel() {
  const { fillTolerance, setFillTolerance, fillPlacement, setFillPlacement } = useFreeformStore()
  return (
    <div className="flex items-center gap-2">
      <DraggableInput label="Tolerance" value={fillTolerance} min={0} max={255} unit="" onChange={setFillTolerance} />
      <Sep />
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-widest text-white/30 font-semibold">Placement</span>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {(['back', 'front'] as FillPlacement[]).map((p) => (
            <button
              key={p}
              onClick={() => setFillPlacement(p)}
              className={[
                'px-2.5 py-1 text-[10px] capitalize transition-colors',
                fillPlacement === p ? 'bg-white/20 text-white' : 'text-white/35 hover:bg-white/5',
              ].join(' ')}
            >{p}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

function VectorBrushOptionsPanel() {
  const { vectorSize, setVectorSize, vectorOpacity, setVectorOpacity, vectorBrushMerge, setVectorBrushMerge } = useFreeformStore()
  return (
    <div className="flex items-center gap-2">
      <DraggableInput label="Size" value={vectorSize} min={1} max={100} unit="px" onChange={setVectorSize} />
      <Sep />
      <DraggableInput label="Opacity" value={Math.round(vectorOpacity * 100)} min={1} max={100} unit="%" onChange={(v) => setVectorOpacity(v / 100)} />
      <Sep />
      <button
        onClick={() => setVectorBrushMerge(!vectorBrushMerge)}
        className={[
          'rounded-lg border px-2.5 py-1 text-[10px] transition select-none',
          vectorBrushMerge
            ? 'border-blue-500/40 bg-blue-500/15 text-blue-300'
            : 'border-white/10 text-white/35 hover:border-white/20 hover:text-white/55',
        ].join(' ')}
      >
        <span className="text-[9px] uppercase tracking-widest font-semibold">Merge</span>
      </button>
    </div>
  )
}

function VectorPenOptionsPanel() {
  const { vectorSize, setVectorSize, vectorOpacity, setVectorOpacity } = useFreeformStore()
  return (
    <div className="flex items-center gap-2">
      <DraggableInput label="Size" value={vectorSize} min={1} max={100} unit="px" onChange={setVectorSize} />
      <Sep />
      <DraggableInput label="Opacity" value={Math.round(vectorOpacity * 100)} min={1} max={100} unit="%" onChange={(v) => setVectorOpacity(v / 100)} />
    </div>
  )
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const TOOL_DEFS: Record<ToolId, ToolDef> = {
  select:     { id: 'select',     label: 'Select',       Icon: MousePointer2, OptionsPanel: null },
  lasso:      { id: 'lasso',      label: 'Lasso Select', Icon: Lasso,         OptionsPanel: null },
  brush:      { id: 'brush',      label: 'Brush',        Icon: Paintbrush,    OptionsPanel: RasterBrushOptionsPanel },
  pen:        { id: 'pen',        label: 'Raster Pen',   Icon: Pen,           OptionsPanel: RasterBrushOptionsPanel },
  eraser:     { id: 'eraser',     label: 'Eraser',       Icon: Eraser,        OptionsPanel: EraserOptionsPanel },
  fill:       { id: 'fill',       label: 'Fill',         Icon: PaintBucket,   OptionsPanel: FillOptionsPanel },
  vector:     { id: 'vector',     label: 'Vector Brush', Icon: Spline,        OptionsPanel: VectorBrushOptionsPanel },
  vectorpen:  { id: 'vectorpen',  label: 'Vector Pen',   Icon: PenToolIcon,   OptionsPanel: VectorPenOptionsPanel },
  eyedropper: { id: 'eyedropper', label: 'Eyedropper',   Icon: Pipette,       OptionsPanel: null },
  pan:        { id: 'pan',        label: 'Hand',         Icon: Hand,          OptionsPanel: null },
}

/**
 * Ordered toolbar slots. One button per slot; Shift+clicking cycles through
 * the slot's sibling tools. The slot's first id is the default.
 */
export const TOOLBAR_SLOTS: ToolSlot[] = [
  { ids: ['select', 'lasso'], shortcut: 'v' },
  { ids: ['brush', 'pen'],    shortcut: 'b' },
  { ids: ['eraser'],          shortcut: 'e' },
  { ids: ['fill'],            shortcut: 'f' },
  { ids: ['vector'],          shortcut: 'w' },
  { ids: ['vectorpen'],       shortcut: 'p' },
  { ids: ['eyedropper'],      shortcut: 'i' },
  { ids: ['pan'],             shortcut: 'h' },
]

/** Which slot (if any) a tool id belongs to */
export function slotForTool(id: ToolId): ToolSlot | undefined {
  return TOOLBAR_SLOTS.find((s) => (s.ids as ToolId[]).includes(id))
}

// ─── Brush preview canvas ─────────────────────────────────────────────────────

export const BrushPreviewCanvas = React.memo(function BrushPreviewCanvas({
  preset, color,
}: { preset: BrushPreset; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = 48, H = 26

    ctx.clearRect(0, 0, W, H)

    const hex = color.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)

    ctx.strokeStyle = `rgb(${r},${g},${b})`
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (preset.hardness < 0.85) {
      ctx.filter = `blur(${((1 - preset.hardness) * 2.5).toFixed(1)}px)`
    }

    const pts = [
      { x: 3,     y: H * 0.72, p: 0.1  },
      { x: W * 0.28, y: H * 0.42, p: 0.65 },
      { x: W * 0.58, y: H * 0.38, p: 1.0  },
      { x: W * 0.8,  y: H * 0.48, p: 0.55 },
      { x: W - 3,  y: H * 0.28, p: 0.15 },
    ]

    const baseSize = 4
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1]!
      const p1 = pts[i]!
      const pressure = (p0.p + p1.p) / 2
      ctx.lineWidth = preset.pressureSize ? baseSize * (0.15 + pressure * 0.85) : baseSize * 0.5
      ctx.globalAlpha = preset.pressureOpacity ? Math.max(0.2, pressure * 0.9) : 0.88

      const sx = i === 1 ? p0.x : (pts[i - 2]!.x + p0.x) / 2
      const sy = i === 1 ? p0.y : (pts[i - 2]!.y + p0.y) / 2
      const ex = i === pts.length - 1 ? p1.x : (p0.x + p1.x) / 2
      const ey = i === pts.length - 1 ? p1.y : (p0.y + p1.y) / 2
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(p0.x, p0.y, ex, ey); ctx.stroke()
    }
    ctx.filter = 'none'; ctx.globalAlpha = 1
  }, [preset, color])

  return <canvas ref={ref} width={48} height={26} className="w-full h-full" />
})

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Sep() {
  return <div className="h-5 w-px rounded bg-white/12 shrink-0" />
}
