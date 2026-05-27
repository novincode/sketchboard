'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  MousePointer2, Lasso, Paintbrush, Pen, Eraser, PaintBucket,
  Spline, PenTool as PenToolIcon, Pipette, Hand, ChevronDown,
  Square as RectIcon, Circle as CircleIcon, Hexagon as PolygonIcon,
  Shapes,
  type LucideIcon,
} from 'lucide-react'

import type { ToolId, EraserMode } from './types'
import type { FillPlacement, ShapeKind } from '@sketchboard/core'
import { HexColorPicker } from 'react-colorful'
import { useFreeformStore } from './store'
import { DraggableInput } from './components/DraggableInput'
import { Popover } from './components/Popover'
import { RASTER_BRUSH_PRESETS } from './brushPresets'
import type { BrushPreset } from './brushPresets'

// ─── Core registry types ──────────────────────────────────────────────────────

export interface ToolDef {
  id: ToolId
  label: string
  Icon: LucideIcon
  OptionsPanel: React.FC | null
}

export interface ToolSlot {
  ids: [ToolId, ...ToolId[]]
  /** Primary shortcut for the slot (cycles siblings via Shift). */
  shortcut: string
  /**
   * Optional per-tool extra shortcuts (Figma-style direct picks: R rect,
   * O ellipse, Y polygon, etc.). When omitted, only the primary shortcut
   * exists for the slot.
   */
  individualShortcuts?: Partial<Record<ToolId, string>>
}

// ─── Brush preset dropdown ────────────────────────────────────────────────────

function BrushPresetDropdown() {
  const { activeBrushPresetId, setActiveBrushPreset, brushColor } = useFreeformStore()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const activePreset = RASTER_BRUSH_PRESETS.find((p) => p.id === activeBrushPresetId) ?? RASTER_BRUSH_PRESETS[0]!

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      setAnchorRect(triggerRef.current.getBoundingClientRect())
    }
    setOpen((o) => !o)
  }

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        onClick={handleToggle}
        title={activePreset.name}
        className={[
          'flex items-center gap-1.5 rounded-lg border transition-all px-2 py-1 select-none',
          open
            ? 'border-blue-400/50 bg-blue-500/10 text-white'
            : 'border-white/12 bg-white/5 hover:border-white/25 text-white/70',
        ].join(' ')}
        style={{ width: 96, height: 32 }}
      >
        <div
          className="flex-1 overflow-hidden rounded-sm"
          style={{
            height: 22,
            backgroundColor: '#f1efe9',
            backgroundImage: `
              linear-gradient(45deg, rgba(0,0,0,0.05) 25%, transparent 25%),
              linear-gradient(-45deg, rgba(0,0,0,0.05) 25%, transparent 25%)
            `,
            backgroundSize: '6px 6px',
            backgroundPosition: '0 0, 0 3px',
          }}
        >
          <BrushPreviewCanvas preset={activePreset} color={brushColor} width={72} height={22} />
        </div>
        <ChevronDown size={9} className="shrink-0 opacity-50" />
      </button>

      {open && (
        <Popover anchorRect={anchorRect} onClose={() => setOpen(false)} width={280}>
          <div
            className="overflow-y-auto rounded-2xl border border-white/10 bg-[#0f0f0f]/96 p-1.5 shadow-2xl backdrop-blur-xl select-none"
            style={{ maxHeight: 420 }}
          >
            <div className="px-3 pt-2 pb-1.5 text-[9px] font-semibold uppercase tracking-widest text-white/30">
              Brushes
            </div>
            {RASTER_BRUSH_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => { setActiveBrushPreset(preset.id); setOpen(false) }}
                className={[
                  'flex w-full flex-col items-stretch gap-1 rounded-xl px-2.5 py-2 transition-colors text-left',
                  preset.id === activeBrushPresetId
                    ? 'bg-blue-500/15 ring-1 ring-blue-400/40'
                    : 'hover:bg-white/6',
                ].join(' ')}
              >
                {/* Procreate-style preview tile: neutral light-pearl surface
                    with a faint checker so ANY brush color (dark or light)
                    reads cleanly. No more dark-stroke-on-dark-bg invisibility. */}
                <div
                  className={[
                    'overflow-hidden rounded-md ring-1',
                    preset.id === activeBrushPresetId ? 'ring-blue-400/40' : 'ring-white/8',
                  ].join(' ')}
                  style={{
                    height: 48,
                    backgroundColor: '#f1efe9',
                    backgroundImage: `
                      linear-gradient(45deg, rgba(0,0,0,0.05) 25%, transparent 25%),
                      linear-gradient(-45deg, rgba(0,0,0,0.05) 25%, transparent 25%),
                      linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.05) 75%),
                      linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.05) 75%)
                    `,
                    backgroundSize: '8px 8px',
                    backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
                  }}
                >
                  <BrushPreviewCanvas preset={preset} color={brushColor} width={252} height={48} />
                </div>
                <span className={[
                  'text-[11px] font-medium tracking-wide',
                  preset.id === activeBrushPresetId ? 'text-white' : 'text-white/65',
                ].join(' ')}>{preset.name}</span>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  )
}

// ─── OptionsPanel components ──────────────────────────────────────────────────

function RasterBrushOptionsPanel() {
  const {
    brushSize, setBrushSize,
    brushOpacity, setBrushOpacity,
    brushHardness, setBrushHardness,
    activeToolId,
  } = useFreeformStore()

  return (
    <div className="flex items-center gap-2">
      <BrushPresetDropdown />
      <Sep />
      <DraggableInput label="Size" value={brushSize} min={1} max={200} unit="px" onChange={setBrushSize} defaultValue={8} />
      <Sep />
      <DraggableInput label="Opacity" value={Math.round(brushOpacity * 100)} min={1} max={100} unit="%" onChange={(v) => setBrushOpacity(v / 100)} defaultValue={100} />
      {activeToolId === 'brush' && (
        <>
          <Sep />
          <DraggableInput label="Hardness" value={Math.round(brushHardness * 100)} min={0} max={100} unit="%" onChange={(v) => setBrushHardness(v / 100)} defaultValue={85} />
        </>
      )}
    </div>
  )
}

function EraserOptionsPanel() {
  const { eraserSize, setEraserSize, eraserMode, setEraserMode } = useFreeformStore()
  return (
    <div className="flex items-center gap-2">
      <DraggableInput label="Size" value={eraserSize} min={1} max={400} unit="px" onChange={setEraserSize} defaultValue={24} />
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
  const {
    fillTolerance, setFillTolerance,
    fillPlacement, setFillPlacement,
    fillGapClose, setFillGapClose,
  } = useFreeformStore()
  return (
    <div className="flex items-center gap-2">
      <DraggableInput label="Tolerance" value={fillTolerance} min={0} max={255} unit="" onChange={setFillTolerance} defaultValue={32} />
      <Sep />
      <DraggableInput label="Gap" value={fillGapClose} min={0} max={32} unit="px" onChange={setFillGapClose} defaultValue={0} />
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

function ShapeOptionsPanel() {
  const {
    shapeKind,
    shapeStrokeColor, setShapeStrokeColor,
    shapeStrokeWidth, setShapeStrokeWidth,
    shapeFillColor, setShapeFillColor,
    shapeOpacity, setShapeOpacity,
    shapeCornerRadius, setShapeCornerRadius,
    shapeSides, setShapeSides,
  } = useFreeformStore()
  // Shape KIND is now picked from the main toolbar (virtual shape-rect / -ellipse
  // / -polygon entries). Options panel only carries the params that vary by kind.
  return (
    <div className="flex items-center gap-2">
      {shapeKind === 'rect' && (
        <>
          <DraggableInput label="Radius" value={shapeCornerRadius} min={0} max={400} unit="px" onChange={setShapeCornerRadius} defaultValue={0} />
          <Sep />
        </>
      )}
      {shapeKind === 'polygon' && (
        <>
          <DraggableInput label="Sides" value={shapeSides} min={3} max={32} unit="" onChange={setShapeSides} defaultValue={6} />
          <Sep />
        </>
      )}
      <DraggableInput label="Stroke" value={shapeStrokeWidth} min={0} max={64} unit="px" onChange={setShapeStrokeWidth} defaultValue={2} />
      <Sep />
      <DraggableInput label="Opacity" value={Math.round(shapeOpacity * 100)} min={0} max={100} unit="%" onChange={(v) => setShapeOpacity(v / 100)} defaultValue={100} />
      <Sep />
      <ColorChip label="S" color={shapeStrokeColor} onChange={setShapeStrokeColor} />
      <ColorChip label="F" color={shapeFillColor} onChange={setShapeFillColor} allowNone />
    </div>
  )
}

/**
 * Tiny inline color chip — opens a popover with HexColorPicker. Used for
 * the shape stroke/fill controls so the user doesn't have to leave the
 * options bar to set them.
 */
function ColorChip({ label, color, onChange, allowNone }: {
  label: string
  color: string | null
  onChange: (hex: string | null) => void
  allowNone?: boolean
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  const isEmpty = color === null
  const rect = triggerRef.current?.getBoundingClientRect()
  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((p) => !p)}
        title={label}
        className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 hover:border-white/25 transition"
      >
        <span
          className="h-4 w-4 rounded-sm border border-white/20"
          style={{
            backgroundColor: isEmpty ? 'transparent' : (color ?? '#000'),
            backgroundImage: isEmpty
              ? 'linear-gradient(135deg, transparent 45%, rgba(255,0,0,0.7) 47%, rgba(255,0,0,0.7) 53%, transparent 55%)'
              : undefined,
          }}
        />
        <span className="text-[9px] uppercase tracking-widest text-white/55 font-semibold">{label}</span>
      </button>
      {open && rect && (
        <div
          ref={popRef}
          className="fixed z-[10100] rounded-2xl border border-white/10 bg-[#1a1a1a]/95 p-3 shadow-2xl backdrop-blur-xl"
          style={{ left: rect.left, top: rect.bottom + 6, width: 220 }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <HexColorPicker
            color={isEmpty ? '#000000' : (color ?? '#000')}
            onChange={(hex) => onChange(hex)}
            style={{ width: '100%' }}
          />
          {allowNone && (
            <button
              onClick={() => { onChange(null); setOpen(false) }}
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 py-1.5 text-[11px] text-white/65 hover:bg-white/10 transition"
            >No {label}</button>
          )}
        </div>
      )}
    </>
  )
}

function VectorBrushOptionsPanel() {
  const {
    vectorSize, setVectorSize,
    vectorOpacity, setVectorOpacity,
    vectorBrushMerge, setVectorBrushMerge,
    vectorStreamline, setVectorStreamline,
  } = useFreeformStore()
  return (
    <div className="flex items-center gap-2">
      <DraggableInput label="Size" value={vectorSize} min={1} max={100} unit="px" onChange={setVectorSize} defaultValue={4} />
      <Sep />
      <DraggableInput label="Opacity" value={Math.round(vectorOpacity * 100)} min={1} max={100} unit="%" onChange={(v) => setVectorOpacity(v / 100)} defaultValue={100} />
      <Sep />
      <DraggableInput label="Streamline" value={Math.round(vectorStreamline * 100)} min={0} max={100} unit="%" onChange={(v) => setVectorStreamline(v / 100)} defaultValue={20} />
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
      <DraggableInput label="Size" value={vectorSize} min={1} max={100} unit="px" onChange={setVectorSize} defaultValue={4} />
      <Sep />
      <DraggableInput label="Opacity" value={Math.round(vectorOpacity * 100)} min={1} max={100} unit="%" onChange={(v) => setVectorOpacity(v / 100)} defaultValue={100} />
    </div>
  )
}

function SelectOptionsPanel() {
  const { selectAcrossLayers, setSelectAcrossLayers } = useFreeformStore()
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-widest text-white/30 font-semibold">Scope</span>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {([
            { v: true,  label: 'All layers', title: 'Click selects across every vector layer (switches active layer)' },
            { v: false, label: 'Active only', title: 'Click only selects elements on the active layer' },
          ]).map((opt) => (
            <button
              key={String(opt.v)}
              onClick={() => setSelectAcrossLayers(opt.v)}
              title={opt.title}
              className={[
                'px-2.5 py-1 text-[10px] capitalize transition-colors',
                selectAcrossLayers === opt.v ? 'bg-white/20 text-white' : 'text-white/35 hover:bg-white/5',
              ].join(' ')}
            >{opt.label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Shortcut auto-builder ────────────────────────────────────────────────────

/**
 * Build the ShortcutOverrides object the KeyboardPlugin expects from our
 * TOOLBAR_SLOTS declaration. For each slot we register:
 *   - `slot-<id>`        : primary shortcut → activates slot[0] (or the
 *                          last-active sibling, depending on the handler)
 *   - `slot-<id>-cycle`  : Shift+key → cycles through siblings
 *   - `tool-<id>`        : per-id direct shortcuts from `individualShortcuts`
 *
 * Single source of truth — new tools added to TOOL_DEFS/TOOLBAR_SLOTS pick
 * up their shortcuts automatically without touching FreeformTemplate.
 *
 * The caller passes a small adapter that knows how to activate a virtual
 * vs. real tool (typically `useFreeformStore.getState().setActiveToolId`).
 */
export interface AutoShortcutHandlers {
  activate: (id: ToolId) => void
  getActive: () => ToolId
}

export function buildToolShortcuts(handlers: AutoShortcutHandlers): Record<string, {
  key: string
  shift?: boolean
  description: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (b: any) => void
}> {
  const out: Record<string, { key: string; shift?: boolean; description: string; handler: () => void }> = {}
  for (const slot of TOOLBAR_SLOTS) {
    const slotKey = slot.shortcut
    const slotIds = slot.ids
    const primaryId = slotIds[0]
    const primaryLabel = TOOL_DEFS[primaryId]?.label ?? primaryId
    out[`slot-${primaryId}`] = {
      key: slotKey,
      description: primaryLabel,
      handler: () => handlers.activate(primaryId),
    }
    if (slotIds.length > 1) {
      out[`slot-${primaryId}-cycle`] = {
        key: slotKey,
        shift: true,
        description: `Cycle ${slotIds.map((id) => TOOL_DEFS[id]?.label ?? id).join(' / ')}`,
        handler: () => {
          const cur = handlers.getActive()
          const idx = slotIds.indexOf(cur)
          const nextId = slotIds[(idx + 1) % slotIds.length]!
          handlers.activate(nextId)
        },
      }
    }
    // Per-tool individual shortcuts (Figma-style direct picks)
    if (slot.individualShortcuts) {
      for (const [toolId, key] of Object.entries(slot.individualShortcuts)) {
        if (!key) continue
        const label = TOOL_DEFS[toolId as ToolId]?.label ?? toolId
        out[`tool-${toolId}`] = {
          key: key.toLowerCase(),
          description: label,
          handler: () => handlers.activate(toolId as ToolId),
        }
      }
    }
  }
  return out
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const TOOL_DEFS: Record<ToolId, ToolDef> = {
  select:        { id: 'select',        label: 'Select',       Icon: MousePointer2, OptionsPanel: SelectOptionsPanel },
  lasso:         { id: 'lasso',         label: 'Lasso Select', Icon: Lasso,         OptionsPanel: SelectOptionsPanel },
  brush:         { id: 'brush',         label: 'Brush',        Icon: Paintbrush,    OptionsPanel: RasterBrushOptionsPanel },
  pen:           { id: 'pen',           label: 'Raster Pen',   Icon: Pen,           OptionsPanel: RasterBrushOptionsPanel },
  eraser:        { id: 'eraser',        label: 'Eraser',       Icon: Eraser,        OptionsPanel: EraserOptionsPanel },
  fill:          { id: 'fill',          label: 'Fill',         Icon: PaintBucket,   OptionsPanel: FillOptionsPanel },
  // Virtual shape entries — each surfaces a different icon in the toolbar
  // and selects the shape tool with the corresponding kind. The base 'shape'
  // entry is kept for completeness but isn't used directly by the toolbar.
  shape:         { id: 'shape',         label: 'Shape',        Icon: Shapes,        OptionsPanel: ShapeOptionsPanel },
  'shape-rect':    { id: 'shape-rect',    label: 'Rectangle', Icon: RectIcon,    OptionsPanel: ShapeOptionsPanel },
  'shape-ellipse': { id: 'shape-ellipse', label: 'Ellipse',   Icon: CircleIcon,  OptionsPanel: ShapeOptionsPanel },
  'shape-polygon': { id: 'shape-polygon', label: 'Polygon',   Icon: PolygonIcon, OptionsPanel: ShapeOptionsPanel },
  vector:        { id: 'vector',        label: 'Vector Brush', Icon: Spline,        OptionsPanel: VectorBrushOptionsPanel },
  vectorpen:     { id: 'vectorpen',     label: 'Vector Pen',   Icon: PenToolIcon,   OptionsPanel: VectorPenOptionsPanel },
  eyedropper:    { id: 'eyedropper',    label: 'Eyedropper',   Icon: Pipette,       OptionsPanel: null },
  pan:           { id: 'pan',           label: 'Hand',         Icon: Hand,          OptionsPanel: null },
}

export const TOOLBAR_SLOTS: ToolSlot[] = [
  { ids: ['select', 'lasso'],                                shortcut: 'v',
    individualShortcuts: { lasso: 'L' } },
  { ids: ['brush', 'pen'],                                   shortcut: 'b' },
  { ids: ['eraser'],                                         shortcut: 'e' },
  { ids: ['fill'],                                           shortcut: 'f' },
  // Three switchable shape kinds in one slot — Shift+R cycles, R picks
  // the most-recently-used. Per-tool Figma-style direct shortcuts:
  //   R = rectangle, O = ellipse, Y = polygon.
  { ids: ['shape-rect', 'shape-ellipse', 'shape-polygon'],   shortcut: 'r',
    individualShortcuts: { 'shape-rect': 'R', 'shape-ellipse': 'O', 'shape-polygon': 'Y' } },
  { ids: ['vector'],                                         shortcut: 'w' },
  { ids: ['vectorpen'],                                      shortcut: 'p' },
  { ids: ['eyedropper'],                                     shortcut: 'i' },
  { ids: ['pan'],             shortcut: 'h' },
]

export function slotForTool(id: ToolId): ToolSlot | undefined {
  return TOOLBAR_SLOTS.find((s) => (s.ids as ToolId[]).includes(id))
}

// ─── Brush preview canvas ─────────────────────────────────────────────────────

export const BrushPreviewCanvas = React.memo(function BrushPreviewCanvas({
  preset, color, width = 56, height = 26,
}: { preset: BrushPreset; color: string; width?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height

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
      ctx.filter = `blur(${((1 - preset.hardness) * (H / 14)).toFixed(1)}px)`
    }

    const pad = Math.max(3, H * 0.18)
    const pts = [
      { x: pad,                 y: H * 0.72, p: 0.1  },
      { x: pad + (W - pad * 2) * 0.25, y: H * 0.40, p: 0.65 },
      { x: pad + (W - pad * 2) * 0.55, y: H * 0.34, p: 1.0  },
      { x: pad + (W - pad * 2) * 0.80, y: H * 0.50, p: 0.55 },
      { x: W - pad,             y: H * 0.28, p: 0.15 },
    ]

    const baseSize = Math.max(2.5, H / 6.5)
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

  return <canvas ref={ref} width={width} height={height} className="w-full h-full" />
})

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Sep() {
  return <div className="h-5 w-px rounded bg-white/12 shrink-0" />
}
