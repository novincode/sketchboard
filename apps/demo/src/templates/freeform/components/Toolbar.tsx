'use client'

import React, { useRef, useCallback, useEffect } from 'react'
import {
  Paintbrush, Pen, Eraser, Hand, Pipette, Spline,
  PenTool as PenToolIcon, MousePointer2, type LucideIcon,
} from 'lucide-react'
import type { ToolId } from '../types'
import { TOOLS } from '../types'
import { useFreeformStore } from '../store'
import { DraggableInput } from './DraggableInput'
import type { EraserMode } from '../types'

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  select: MousePointer2,
  brush:  Paintbrush,
  pen:    Pen,
  eraser: Eraser,
  vector: Spline,
  vectorpen: PenToolIcon,
  eyedropper: Pipette,
  hand:   Hand,
}

// Sub-tools shown in the long-press / right-click popup
const SUB_TOOLS: Partial<Record<string, Array<{ id: ToolId; label: string; shortcut: string }>>> = {
  brush:  [
    { id: 'brush', label: 'Raster Brush', shortcut: 'B' },
    { id: 'pen',   label: 'Raster Pen',   shortcut: 'P' },
  ],
}

const SUB_TOOL_PARENT: Partial<Record<ToolId, ToolId>> = { pen: 'brush' }

// ─── Snap geometry ────────────────────────────────────────────────────────────

type SnapEdge = 'bottom' | 'left' | 'right' | 'top'
const SNAP_THRESHOLD = 80
const EDGE_MARGIN = 12
const TOP_BAR_H = 52   // reserved for the top bar

// Estimated toolbar pixel sizes — used for clamping. Generous so toolbar never clips.
const TOOLBAR_CROSS_AXIS = 52   // thickness of toolbar perpendicular to snap edge
const TOOLBAR_MAIN_ESTIMATED_H = 340  // vertical toolbar height estimate
const TOOLBAR_MAIN_ESTIMATED_W = 310  // horizontal toolbar width estimate

function computeSnap(pointerX: number, pointerY: number): { snap: SnapEdge; offset: number } {
  const vw = window.innerWidth, vh = window.innerHeight
  const relX = pointerX / vw, relY = pointerY / vh
  if (pointerY > vh - SNAP_THRESHOLD) return { snap: 'bottom', offset: relX }
  if (pointerY < SNAP_THRESHOLD)       return { snap: 'top',    offset: relX }
  if (pointerX < SNAP_THRESHOLD)       return { snap: 'left',   offset: relY }
  if (pointerX > vw - SNAP_THRESHOLD)  return { snap: 'right',  offset: relY }
  return { snap: 'bottom', offset: relX }
}

function clampOffset(snap: SnapEdge, raw: number): number {
  const vw = window.innerWidth, vh = window.innerHeight
  if (snap === 'bottom' || snap === 'top') {
    const half = TOOLBAR_MAIN_ESTIMATED_W / 2
    const margin = EDGE_MARGIN + half
    return Math.max(margin / vw, Math.min(1 - margin / vw, raw))
  }
  // left / right
  const topEdge = (TOP_BAR_H + EDGE_MARGIN + TOOLBAR_MAIN_ESTIMATED_H / 2) / vh
  const botEdge = 1 - (EDGE_MARGIN + TOOLBAR_MAIN_ESTIMATED_H / 2) / vh
  return Math.max(topEdge, Math.min(botEdge, raw))
}

// ─── FloatingToolbar ──────────────────────────────────────────────────────────

export function Toolbar() {
  const {
    activeToolId, setActiveToolId, brushColor, toggleColorPicker,
    toolbarSnap, toolbarEdgeOffset, setToolbarSnap,
    brushSize, setBrushSize, brushOpacity, setBrushOpacity, brushHardness, setBrushHardness,
    eraserSize, setEraserSize, eraserMode, setEraserMode,
    vectorSize, setVectorSize, vectorOpacity, setVectorOpacity,
  } = useFreeformStore()

  const dragRef = useRef<{ startPX: number; startPY: number } | null>(null)
  const [subMenu, setSubMenu] = React.useState<{ x: number; y: number; toolId: string } | null>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Drag handling ─────────────────────────────────────────────────────────
  const onGripDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startPX: e.clientX, startPY: e.clientY }
    e.preventDefault()
  }, [])

  const onGripMove = useCallback((e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !dragRef.current) return
    const { snap, offset } = computeSnap(e.clientX, e.clientY)
    setToolbarSnap(snap, clampOffset(snap, offset))
  }, [setToolbarSnap])

  const onGripUp = useCallback((e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
  }, [])

  // ── Long-press / right-click for sub-tool menu ────────────────────────────
  const startLongPress = useCallback((e: React.PointerEvent, toolId: string) => {
    if (!SUB_TOOLS[toolId]) return
    longPressRef.current = setTimeout(() => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setSubMenu({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, toolId })
    }, 500)
  }, [])

  const cancelLongPress = useCallback(() => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null }
  }, [])

  const onToolRightClick = useCallback((e: React.MouseEvent, toolId: string) => {
    if (!SUB_TOOLS[toolId]) return
    e.preventDefault()
    setSubMenu({ x: e.clientX, y: e.clientY, toolId })
  }, [])

  // Close sub-menu on outside click
  useEffect(() => {
    if (!subMenu) return
    const handler = () => setSubMenu(null)
    window.addEventListener('pointerdown', handler, true)
    return () => window.removeEventListener('pointerdown', handler, true)
  }, [subMenu])

  const isVertical = toolbarSnap === 'left' || toolbarSnap === 'right'

  // ── Position calculation (clamped) ────────────────────────────────────────
  const offset = clampOffset(toolbarSnap, toolbarEdgeOffset)

  let toolbarStyle: React.CSSProperties = {}
  let optionsStyle: React.CSSProperties = {}

  if (toolbarSnap === 'bottom') {
    toolbarStyle = { position: 'fixed', bottom: EDGE_MARGIN, left: `${offset * 100}%`, transform: 'translateX(-50%)' }
    optionsStyle = { position: 'fixed', bottom: EDGE_MARGIN + TOOLBAR_CROSS_AXIS + 6, left: `${offset * 100}%`, transform: 'translateX(-50%)' }
  } else if (toolbarSnap === 'top') {
    const topPx = TOP_BAR_H + EDGE_MARGIN
    toolbarStyle = { position: 'fixed', top: topPx, left: `${offset * 100}%`, transform: 'translateX(-50%)' }
    optionsStyle = { position: 'fixed', top: topPx + TOOLBAR_CROSS_AXIS + 6, left: `${offset * 100}%`, transform: 'translateX(-50%)' }
  } else if (toolbarSnap === 'left') {
    toolbarStyle = { position: 'fixed', left: EDGE_MARGIN, top: `${offset * 100}%`, transform: 'translateY(-50%)' }
    optionsStyle = { position: 'fixed', left: EDGE_MARGIN + TOOLBAR_CROSS_AXIS + 6, top: `${offset * 100}%`, transform: 'translateY(-50%)' }
  } else {
    toolbarStyle = { position: 'fixed', right: EDGE_MARGIN, top: `${offset * 100}%`, transform: 'translateY(-50%)' }
    optionsStyle = { position: 'fixed', right: EDGE_MARGIN + TOOLBAR_CROSS_AXIS + 6, top: `${offset * 100}%`, transform: 'translateY(-50%)' }
  }

  // Icon for the brush slot: changes when 'pen' sub-tool is active
  const getToolIcon = (toolId: string): LucideIcon => {
    if (toolId === 'brush' && activeToolId === 'pen') return ICON_MAP['pen'] ?? Paintbrush
    return ICON_MAP[toolId] ?? Paintbrush
  }

  const isToolActive = (toolId: string): boolean => {
    if (activeToolId === toolId) return true
    return SUB_TOOL_PARENT[activeToolId] === toolId
  }

  const showOptions = !['pan', 'eyedropper', 'select'].includes(activeToolId)

  return (
    <>
      {/* Tool options panel */}
      {showOptions && (
        <div style={{ ...optionsStyle, zIndex: 40 }}>
          <div className={[
            'flex items-center gap-3 rounded-2xl border border-white/10 bg-black/82 px-4 py-3 shadow-xl backdrop-blur-xl',
            isVertical ? 'flex-col' : 'flex-row',
          ].join(' ')}>
            <ToolOptions
              activeToolId={activeToolId}
              brushSize={brushSize} setBrushSize={setBrushSize}
              brushOpacity={brushOpacity} setBrushOpacity={setBrushOpacity}
              brushHardness={brushHardness} setBrushHardness={setBrushHardness}
              eraserSize={eraserSize} setEraserSize={setEraserSize}
              eraserMode={eraserMode} setEraserMode={setEraserMode}
              vectorSize={vectorSize} setVectorSize={setVectorSize}
              vectorOpacity={vectorOpacity} setVectorOpacity={setVectorOpacity}
              vertical={isVertical}
            />
          </div>
        </div>
      )}

      {/* Main toolbar */}
      <div style={{ ...toolbarStyle, zIndex: 50 }}>
        <div className={[
          'flex items-center gap-1 rounded-[22px] border border-white/12 bg-black/80 shadow-2xl backdrop-blur-xl',
          isVertical ? 'flex-col px-2 py-3' : 'flex-row px-2.5 py-2',
        ].join(' ')}>

          {/* Drag grip */}
          <div
            className={[
              'flex cursor-grab items-center active:cursor-grabbing text-white/18 hover:text-white/38 transition',
              isVertical ? 'py-0.5 px-1' : 'pr-0.5 pl-0.5',
            ].join(' ')}
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            title="Drag to dock toolbar"
          >
            <GripIcon vertical={isVertical} />
          </div>

          {/* Color swatch */}
          <button
            onClick={toggleColorPicker}
            className="h-7 w-7 rounded-full border-2 border-white/25 shadow-inner hover:border-white/50 transition shrink-0"
            style={{ backgroundColor: brushColor }}
            title="Color"
          />

          <Divider vertical={isVertical} />

          {/* Tool buttons */}
          {TOOLS.map((tool) => {
            const Icon = getToolIcon(tool.id)
            const active = isToolActive(tool.id)
            const hasSubs = !!SUB_TOOLS[tool.id]
            return (
              <button
                key={tool.id}
                onClick={() => setActiveToolId(tool.id as ToolId)}
                onContextMenu={(e) => onToolRightClick(e, tool.id)}
                onPointerDown={(e) => startLongPress(e, tool.id)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                title={`${tool.label} (${tool.shortcut})${hasSubs ? ' · hold for variants' : ''}`}
                aria-pressed={active}
                className={[
                  'relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-100 focus:outline-none select-none',
                  active
                    ? 'bg-white/15 text-white ring-1 ring-white/35'
                    : 'text-white/40 hover:bg-white/8 hover:text-white/75',
                ].join(' ')}
              >
                <Icon size={16} strokeWidth={1.75} />
                {active && !isVertical && (
                  <span className="absolute -bottom-1 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-white/55" />
                )}
                {hasSubs && (
                  <span className="absolute bottom-1 right-1 h-1 w-1 rounded-full bg-white/35" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sub-tool popup — styled to match toolbar (not a context menu) */}
      {subMenu && <SubToolPopup x={subMenu.x} y={subMenu.y} toolId={subMenu.toolId} snap={toolbarSnap} onSelect={(id) => { setActiveToolId(id); setSubMenu(null) }} />}
    </>
  )
}

// ─── Sub-tool popup ───────────────────────────────────────────────────────────

function SubToolPopup({ x, y, toolId, snap, onSelect }: {
  x: number; y: number; toolId: string; snap: SnapEdge
  onSelect: (id: ToolId) => void
}) {
  const subs = SUB_TOOLS[toolId] ?? []
  const isVertical = snap === 'left' || snap === 'right'

  // Position the popup on the "canvas" side of the toolbar
  let style: React.CSSProperties = {}
  if (snap === 'bottom')      style = { bottom: window.innerHeight - y + 10, left: x, transform: 'translateX(-50%)' }
  else if (snap === 'top')    style = { top: y + 10, left: x, transform: 'translateX(-50%)' }
  else if (snap === 'left')   style = { left: x + 10, top: y, transform: 'translateY(-50%)' }
  else                        style = { right: window.innerWidth - x + 10, top: y, transform: 'translateY(-50%)' }

  return (
    <div
      className={[
        'fixed z-200 flex items-center gap-1 rounded-2xl border border-white/12 bg-black/92 p-1.5 shadow-2xl backdrop-blur-xl',
        isVertical ? 'flex-col' : 'flex-row',
      ].join(' ')}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Arrow indicator */}
      {subs.map((sub) => (
        <button
          key={sub.id}
          onClick={() => onSelect(sub.id)}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white transition whitespace-nowrap"
        >
          <span className="font-medium">{sub.label}</span>
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/35">{sub.shortcut}</kbd>
        </button>
      ))}
    </div>
  )
}

// ─── Tool options ─────────────────────────────────────────────────────────────

function ToolOptions({
  activeToolId,
  brushSize, setBrushSize,
  brushOpacity, setBrushOpacity,
  brushHardness, setBrushHardness,
  eraserSize, setEraserSize,
  eraserMode, setEraserMode,
  vectorSize, setVectorSize,
  vectorOpacity, setVectorOpacity,
  vertical,
}: {
  activeToolId: ToolId
  brushSize: number; setBrushSize: (n: number) => void
  brushOpacity: number; setBrushOpacity: (n: number) => void
  brushHardness: number; setBrushHardness: (n: number) => void
  eraserSize: number; setEraserSize: (n: number) => void
  eraserMode: EraserMode; setEraserMode: (m: EraserMode) => void
  vectorSize: number; setVectorSize: (n: number) => void
  vectorOpacity: number; setVectorOpacity: (n: number) => void
  vertical: boolean
}) {
  const d = vertical ? 'flex flex-col gap-2 items-center' : 'flex flex-row gap-3 items-end'

  if (activeToolId === 'pen' || activeToolId === 'brush') {
    return (
      <div className={d}>
        <DraggableInput label="Size" value={brushSize} min={1} max={200} unit="px" onChange={setBrushSize} />
        <Divider vertical={vertical} />
        <DraggableInput label="Opacity" value={Math.round(brushOpacity * 100)} min={1} max={100} unit="%" onChange={(v) => setBrushOpacity(v / 100)} />
        {activeToolId === 'brush' && (
          <>
            <Divider vertical={vertical} />
            <DraggableInput label="Hardness" value={Math.round(brushHardness * 100)} min={0} max={100} unit="%" onChange={(v) => setBrushHardness(v / 100)} />
          </>
        )}
      </div>
    )
  }

  if (activeToolId === 'eraser') {
    return (
      <div className={d}>
        <DraggableInput label="Size" value={eraserSize} min={1} max={400} unit="px" onChange={setEraserSize} />
        <Divider vertical={vertical} />
        <div className="flex flex-col items-center gap-1 select-none">
          <span className="text-[9px] uppercase tracking-widest text-white/30 font-semibold">Mode</span>
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {(['pixel', 'stroke'] as EraserMode[]).map((m) => (
              <button key={m} onClick={() => setEraserMode(m)}
                className={['px-3 py-1 text-xs capitalize transition-colors', eraserMode === m ? 'bg-white/20 text-white' : 'text-white/35 hover:bg-white/5'].join(' ')}
              >{m}</button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (activeToolId === 'vector' || activeToolId === 'vectorpen') {
    return (
      <div className={d}>
        <DraggableInput label="Size" value={vectorSize} min={1} max={100} unit="px" onChange={setVectorSize} />
        <Divider vertical={vertical} />
        <DraggableInput label="Opacity" value={Math.round(vectorOpacity * 100)} min={1} max={100} unit="%" onChange={(v) => setVectorOpacity(v / 100)} />
        {activeToolId === 'vectorpen' && (
          <>
            <Divider vertical={vertical} />
            <span className="text-[10px] text-white/30 whitespace-nowrap">Click · Drag=curve · ↩ done · Esc cancel</span>
          </>
        )}
      </div>
    )
  }

  return null
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Divider({ vertical }: { vertical: boolean }) {
  return (
    <div className={vertical ? 'w-5 h-px rounded bg-white/10' : 'h-8 w-px rounded bg-white/10'} />
  )
}

function GripIcon({ vertical }: { vertical: boolean }) {
  return vertical ? (
    <svg width="12" height="6" viewBox="0 0 12 6" fill="currentColor">
      <circle cx="3" cy="1.5" r="1.2" /><circle cx="9" cy="1.5" r="1.2" />
      <circle cx="3" cy="4.5" r="1.2" /><circle cx="9" cy="4.5" r="1.2" />
    </svg>
  ) : (
    <svg width="6" height="14" viewBox="0 0 6 14" fill="currentColor">
      <circle cx="1.5" cy="3" r="1.2" /><circle cx="4.5" cy="3" r="1.2" />
      <circle cx="1.5" cy="7" r="1.2" /><circle cx="4.5" cy="7" r="1.2" />
      <circle cx="1.5" cy="11" r="1.2" /><circle cx="4.5" cy="11" r="1.2" />
    </svg>
  )
}
