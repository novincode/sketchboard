'use client'

import React, { useRef, useCallback } from 'react'
import {
  Paintbrush, Pen, Eraser, Hand, Pipette, Spline,
  PenTool as PenToolIcon, MousePointer2, type LucideIcon,
} from 'lucide-react'
import type { ToolId } from '../types'
import { TOOLS } from '../types'
import { useFreeformStore } from '../store'
import { DraggableInput } from './DraggableInput'
import { ContextMenu } from './ContextMenu'
import type { ContextMenuAction } from './ContextMenu'
import type { EraserMode } from '../types'

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  select: MousePointer2,
  brush:  Paintbrush,
  pen:    Pen,          // used when 'pen' is the active sub-tool of brush
  eraser: Eraser,
  vector: Spline,
  vectorpen: PenToolIcon,
  eyedropper: Pipette,
  hand:   Hand,
}

// Sub-tools for right-click menus
const SUB_TOOLS: Partial<Record<string, Array<{ id: ToolId; label: string; shortcut: string }>>> = {
  brush:  [
    { id: 'brush', label: 'Raster Brush', shortcut: 'B' },
    { id: 'pen',   label: 'Raster Pen',   shortcut: 'P' },
  ],
  select: [
    { id: 'select', label: 'Rectangle Select', shortcut: 'V' },
  ],
}

// Which toolbar slot owns a sub-tool
const SUB_TOOL_PARENT: Partial<Record<ToolId, ToolId>> = { pen: 'brush' }

// ─── Snap geometry ────────────────────────────────────────────────────────────

type SnapEdge = 'bottom' | 'left' | 'right' | 'top'
const SNAP_THRESHOLD = 80
const EDGE_MARGIN = 12

function computeSnap(pointerX: number, pointerY: number): { snap: SnapEdge; offset: number } {
  const vw = window.innerWidth, vh = window.innerHeight
  const relX = pointerX / vw, relY = pointerY / vh
  if (pointerY > vh - SNAP_THRESHOLD) return { snap: 'bottom', offset: relX }
  if (pointerY < SNAP_THRESHOLD)       return { snap: 'top',    offset: relX }
  if (pointerX < SNAP_THRESHOLD)       return { snap: 'left',   offset: relY }
  if (pointerX > vw - SNAP_THRESHOLD)  return { snap: 'right',  offset: relY }
  return { snap: 'bottom', offset: relX }
}

// ─── FloatingToolbar (toolbar + tool options, always co-located) ──────────────

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

  // ── Drag handling ────────────────────────────────────────────────────────────
  const onGripDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startPX: e.clientX, startPY: e.clientY }
    e.preventDefault()
  }, [])

  const onGripMove = useCallback((e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !dragRef.current) return
    const { snap, offset } = computeSnap(e.clientX, e.clientY)
    setToolbarSnap(snap, offset)
  }, [setToolbarSnap])

  const onGripUp = useCallback((e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
  }, [])

  const onToolRightClick = useCallback((e: React.MouseEvent, toolId: string) => {
    if (!SUB_TOOLS[toolId]) return
    e.preventDefault()
    setSubMenu({ x: e.clientX, y: e.clientY, toolId })
  }, [])

  const isVertical = toolbarSnap === 'left' || toolbarSnap === 'right'
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900

  // Compute toolbar position
  let toolbarStyle: React.CSSProperties = {}
  if (toolbarSnap === 'bottom') {
    toolbarStyle = { position: 'fixed', bottom: EDGE_MARGIN, left: `${toolbarEdgeOffset * 100}%`, transform: 'translateX(-50%)' }
  } else if (toolbarSnap === 'top') {
    toolbarStyle = { position: 'fixed', top: EDGE_MARGIN + 40, left: `${toolbarEdgeOffset * 100}%`, transform: 'translateX(-50%)' }
  } else if (toolbarSnap === 'left') {
    toolbarStyle = { position: 'fixed', left: EDGE_MARGIN, top: `${toolbarEdgeOffset * 100}%`, transform: 'translateY(-50%)' }
  } else {
    toolbarStyle = { position: 'fixed', right: EDGE_MARGIN, top: `${toolbarEdgeOffset * 100}%`, transform: 'translateY(-50%)' }
  }

  // Compute options panel position (always adjacent to toolbar, on the "canvas" side)
  let optionsStyle: React.CSSProperties = {}
  if (toolbarSnap === 'bottom') {
    optionsStyle = { position: 'fixed', bottom: `calc(${EDGE_MARGIN}px + 56px)`, left: `${toolbarEdgeOffset * 100}%`, transform: 'translateX(-50%)' }
  } else if (toolbarSnap === 'top') {
    optionsStyle = { position: 'fixed', top: `calc(${EDGE_MARGIN + 40}px + 56px)`, left: `${toolbarEdgeOffset * 100}%`, transform: 'translateX(-50%)' }
  } else if (toolbarSnap === 'left') {
    optionsStyle = { position: 'fixed', left: `calc(${EDGE_MARGIN}px + 60px)`, top: `${toolbarEdgeOffset * 100}%`, transform: 'translateY(-50%)' }
  } else {
    optionsStyle = { position: 'fixed', right: `calc(${EDGE_MARGIN}px + 60px)`, top: `${toolbarEdgeOffset * 100}%`, transform: 'translateY(-50%)' }
  }

  // Icon for the brush slot: changes when 'pen' sub-tool is active
  const getToolIcon = (toolId: string): LucideIcon => {
    if (toolId === 'brush' && activeToolId === 'pen') return ICON_MAP['pen'] ?? Paintbrush
    return ICON_MAP[toolId] ?? Paintbrush
  }

  // Highlight: the button highlights for its own id AND its sub-tools
  const isToolActive = (toolId: string): boolean => {
    if (activeToolId === toolId) return true
    return SUB_TOOL_PARENT[activeToolId] === toolId
  }

  // Show options for pen as well (it's a brush sub-tool)
  const showOptions = !['pan', 'eyedropper', 'select'].includes(activeToolId)

  return (
    <>
      {/* Tool options panel — adjacent to toolbar */}
      {showOptions && (
        <div style={optionsStyle} className="z-40">
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
                title={`${tool.label} (${tool.shortcut})${hasSubs ? ' · right-click for variants' : ''}`}
                aria-pressed={active}
                className={[
                  'relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-100 focus:outline-none',
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

      {/* Sub-tool context menu */}
      {subMenu && (
        <ContextMenu
          x={subMenu.x} y={subMenu.y}
          entries={(SUB_TOOLS[subMenu.toolId] ?? []).map((sub) => ({
            label: sub.label,
            shortcut: sub.shortcut,
            onClick: () => { setActiveToolId(sub.id) },
          } satisfies ContextMenuAction))}
          onClose={() => setSubMenu(null)}
        />
      )}
    </>
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
  const div = (key: string, content: React.ReactNode) => <div key={key} className={d}>{content}</div>

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
