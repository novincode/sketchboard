'use client'

import React, { useEffect, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { Link2, Link2Off } from 'lucide-react'
import type { SelectTool, VectorShape } from '@sketchboard/core'
import { useFreeformStore } from '../store'
import { DraggableInput } from './DraggableInput'
import { AutoPopover } from './AutoPopover'

/**
 * Right-docked Figma-style properties sidebar for the active selection.
 *
 * Mount conditions:
 *   - SelectTool / LassoSelectTool / VectorPen is the active tool, AND
 *   - There is a vector selection (`getElementStyle()` returns non-null),
 *     OR there is a raster lasso selection
 *
 * Driven by `board.hooks.selectionChanged` — fires whenever SelectTool's
 * selection set, edit state, or focused layer changes. We can't rely on
 * `afterRender` because selection mutations don't dirty any layer.
 */
export function VectorStylePanel() {
  const board = useFreeformStore((s) => s.board)
  const activeToolId = useFreeformStore((s) => s.activeToolId)

  const [style, setStyle] = useState<ReturnType<SelectTool['getElementStyle']>>(null)
  const [shape, setShape] = useState<VectorShape | null>(null)
  const [hasRasterLasso, setHasRasterLasso] = useState(false)

  useEffect(() => {
    if (!board) { setStyle(null); setShape(null); setHasRasterLasso(false); return }
    const select = board.getTool<SelectTool>('select')
    if (!select) { setStyle(null); setShape(null); setHasRasterLasso(false); return }

    const refresh = () => {
      setStyle(select.getElementStyle())
      setShape(select.getSelectedShape())
      setHasRasterLasso(select.getRasterLassoSelection() !== null)
    }
    const unsub = board.hooks.selectionChanged.tap('vector-style-sidebar', refresh)
    // Refresh on every render too — a shape edit (radius drag) doesn't change
    // selection, but the displayed values still need to update. Cheap because
    // afterRender only fires when the layer is actually dirty.
    const unsubRender = board.hooks.afterRender.tap('vector-style-sidebar-rerender', refresh)
    const unsubLayer = board.hooks.activeLayerChanged.tap('vector-style-sidebar', refresh)
    refresh()
    return () => { unsub(); unsubRender(); unsubLayer() }
  }, [board])

  // Only show on selection-capable tools.
  const toolOk = activeToolId === 'select' || activeToolId === 'lasso' || activeToolId === 'vectorpen'
  if (!toolOk) return null
  if (!style && !hasRasterLasso) return null

  return <Sidebar style={style} shape={shape} hasRasterLasso={hasRasterLasso} board={board!} />
}

function Sidebar({ style, shape, hasRasterLasso, board }: {
  style: ReturnType<SelectTool['getElementStyle']>
  shape: VectorShape | null
  hasRasterLasso: boolean
  board: NonNullable<ReturnType<typeof useFreeformStore.getState>['board']>
}) {
  const select = board.getTool<SelectTool>('select')
  if (!select) return null

  const apply = (patch: Parameters<SelectTool['setElementStyle']>[0]) => {
    select.setElementStyle(patch)
  }

  return (
    <aside
      className="fixed right-0 top-14 z-[9400] flex flex-col gap-4 border-l border-white/10 bg-[#111]/95 p-4 shadow-2xl backdrop-blur-xl select-none"
      style={{ width: 252, bottom: 0, overflowY: 'auto' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <SidebarStyles />

      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
          {style ? 'Vector Style' : 'Pixel Selection'}
        </span>
        <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/45">
          {style ? `${select.getSelectedIds().length} sel` : 'lasso'}
        </span>
      </div>

      {style && (
        <>
          <FieldGroup label="Fill">
            <Swatch
              color={style.fillColor ?? 'transparent'}
              mixed={style.mixedFillColor}
              empty={style.fillColor === null}
              onChange={(hex) => apply({ fillColor: hex })}
              onClear={() => apply({ fillColor: null })}
              direction="down"
            />
          </FieldGroup>

          <FieldGroup label="Stroke">
            <Swatch
              color={style.strokeColor ?? '#000000'}
              mixed={style.mixedStrokeColor}
              onChange={(hex) => apply({ strokeColor: hex })}
              direction="down"
            />
            <DraggableInput
              label="Width"
              value={Math.round(style.strokeWidth * 10) / 10}
              min={0}
              max={120}
              unit="px"
              onChange={(v) => apply({ strokeWidth: v })}
            />
          </FieldGroup>

          <FieldGroup label="Appearance">
            <DraggableInput
              label="Opacity"
              value={Math.round(style.opacity * 100)}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => apply({ opacity: v / 100 })}
            />
          </FieldGroup>

          {shape && shape.kind === 'rect' && (
            <GeometryGroup
              label="Corner radius"
              shape={shape}
              onChange={(patch) => select.setSelectedShape(patch)}
            />
          )}
          {shape && shape.kind === 'polygon' && (
            <>
              <FieldGroup label="Polygon">
                <DraggableInput
                  label="Sides"
                  value={shape.sides ?? 6}
                  min={3}
                  max={32}
                  unit=""
                  onChange={(v) => select.setSelectedShape({ sides: v })}
                />
                {/* Uniform radius for polygon vertices — single value rounds
                    every vertex equally. Stored in cornerRadius[0]. */}
                <DraggableInput
                  label="Radius"
                  value={Math.round(shape.cornerRadius?.[0] ?? 0)}
                  min={0}
                  max={Math.floor(Math.min(shape.width, shape.height) / 2)}
                  unit="px"
                  onChange={(v) => select.setSelectedShape({ cornerRadius: [v, v, v, v] })}
                />
              </FieldGroup>
            </>
          )}

          <FieldGroup label="Actions">
            <ActionRow>
              <button
                onClick={() => select.copySelected()}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 py-1.5 text-[11px] text-white/65 hover:bg-white/10 transition"
              >Copy</button>
              <button
                onClick={() => select.cutSelected()}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 py-1.5 text-[11px] text-white/65 hover:bg-white/10 transition"
              >Cut</button>
              <button
                onClick={() => select.deleteSelected()}
                className="flex-1 rounded-lg border border-rose-400/30 bg-rose-500/15 py-1.5 text-[11px] text-rose-200 hover:bg-rose-500/25 transition"
              >Delete</button>
            </ActionRow>
            <button
              onClick={() => select.deselect()}
              className="rounded-lg border border-white/10 bg-white/5 py-1.5 text-[11px] text-white/65 hover:bg-white/10 transition"
            >Deselect</button>
          </FieldGroup>
        </>
      )}

      {hasRasterLasso && !style && (
        <>
          <FieldGroup label="Pixel selection">
            <p className="text-[11px] text-white/55 leading-relaxed">
              You have a lasso area on a raster layer. Press <kbd className="rounded bg-white/8 px-1 py-0.5 font-mono text-[10px] text-white/75">Delete</kbd> to clear the pixels inside it.
            </p>
            <ActionRow>
              <button
                onClick={() => select.deleteSelected()}
                className="flex-1 rounded-lg border border-rose-400/30 bg-rose-500/15 py-1.5 text-[11px] text-rose-200 hover:bg-rose-500/25 transition"
              >Clear pixels</button>
              <button
                onClick={() => select.setRasterLassoSelection(null)}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 py-1.5 text-[11px] text-white/65 hover:bg-white/10 transition"
              >Dismiss</button>
            </ActionRow>
          </FieldGroup>
        </>
      )}
    </aside>
  )
}

/**
 * Figma-style corner-radius editor.
 *
 *   - Linked mode (default): one slider drives all 4 corners uniformly. Icon
 *     shows a closed link. Click the icon to switch to per-corner mode.
 *   - Unlinked mode: 4 small inputs in a 2x2 grid mirroring the rectangle's
 *     corner positions (TL TR / BL BR). Click the icon (now an open link) to
 *     re-link — re-link uses the first corner's value as the new uniform value.
 */
function GeometryGroup({
  label, shape, onChange,
}: {
  label: string
  shape: VectorShape
  onChange: (patch: Partial<VectorShape>) => void
}) {
  const radii = shape.cornerRadius ?? [0, 0, 0, 0]
  const allEqual = radii[0] === radii[1] && radii[1] === radii[2] && radii[2] === radii[3]
  const [linked, setLinked] = useState(allEqual)

  // Whenever radii become non-uniform externally, automatically switch to unlinked.
  useEffect(() => {
    if (!allEqual && linked) setLinked(false)
  }, [allEqual, linked])

  const maxR = Math.floor(Math.min(shape.width, shape.height) / 2)
  const setAll = (v: number) => onChange({ cornerRadius: [v, v, v, v] })
  const setOne = (idx: 0 | 1 | 2 | 3, v: number) => {
    const next = [...radii] as [number, number, number, number]
    next[idx] = v
    onChange({ cornerRadius: next })
  }

  return (
    <div className="flex flex-col gap-2 pb-3 border-b border-white/6 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-widest text-white/35 font-semibold">{label}</span>
        <button
          onClick={() => {
            const nextLinked = !linked
            setLinked(nextLinked)
            if (nextLinked) setAll(radii[0])  // re-link with TL value
          }}
          title={linked ? 'Edit corners independently' : 'Link all corners'}
          className={[
            'flex h-6 w-6 items-center justify-center rounded-md border transition',
            linked
              ? 'border-blue-400/50 bg-blue-500/15 text-blue-300'
              : 'border-white/15 bg-white/5 text-white/45 hover:text-white/80',
          ].join(' ')}
        >
          {linked ? <Link2 size={11} /> : <Link2Off size={11} />}
        </button>
      </div>
      {linked ? (
        <DraggableInput
          label="All"
          value={Math.round(radii[0])}
          min={0}
          max={maxR}
          unit="px"
          onChange={(v) => setAll(v)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <CornerInput corner="TL" value={radii[0]} max={maxR} onChange={(v) => setOne(0, v)} />
          <CornerInput corner="TR" value={radii[1]} max={maxR} onChange={(v) => setOne(1, v)} />
          <CornerInput corner="BL" value={radii[3]} max={maxR} onChange={(v) => setOne(3, v)} />
          <CornerInput corner="BR" value={radii[2]} max={maxR} onChange={(v) => setOne(2, v)} />
        </div>
      )}
    </div>
  )
}

function CornerInput({ corner, value, max, onChange }: {
  corner: 'TL' | 'TR' | 'BL' | 'BR'
  value: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-1.5 py-1">
      <span className="text-[9px] font-mono text-white/30">{corner}</span>
      <DraggableInput
        label=""
        value={Math.round(value)}
        min={0}
        max={max}
        unit=""
        onChange={onChange}
      />
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 pb-3 border-b border-white/6 last:border-b-0 last:pb-0">
      <span className="text-[9px] uppercase tracking-widest text-white/35 font-semibold">{label}</span>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  )
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1.5">{children}</div>
}

function Swatch({
  color, mixed, empty, onChange, onClear, direction: _direction,
}: {
  color: string
  mixed: boolean
  empty?: boolean
  onChange: (hex: string) => void
  onClear?: () => void
  /** @deprecated — AutoPopover picks the side automatically now. Kept for callsite compat. */
  direction: 'down' | 'left'
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const handleToggle = () => {
    if (!open && triggerRef.current) setAnchorRect(triggerRef.current.getBoundingClientRect())
    setOpen((p) => !p)
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className={[
          'flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 transition',
          open ? 'border-blue-400/60 bg-blue-500/10' : 'border-white/10 bg-white/5 hover:border-white/25',
        ].join(' ')}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-5 w-5 rounded-md border border-white/20"
            style={{
              backgroundColor: empty ? 'transparent' : color,
              backgroundImage: empty
                ? 'linear-gradient(135deg, transparent 45%, rgba(255,0,0,0.7) 47%, rgba(255,0,0,0.7) 53%, transparent 55%)'
                : mixed
                ? 'linear-gradient(45deg, rgba(0,0,0,0.4) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.4) 75%)'
                : undefined,
              backgroundSize: mixed && !empty ? '6px 6px' : undefined,
            }}
          />
          <span className="font-mono text-[10px] text-white/55">
            {empty ? 'none' : mixed ? 'mixed' : color.toUpperCase()}
          </span>
        </div>
        <svg width="9" height="6" viewBox="0 0 9 6" fill="none" className="text-white/35">
          <path d="M1 1L4.5 5L8 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>

      <AutoPopover
        anchorRect={anchorRect}
        open={open}
        onClose={() => setOpen(false)}
        width={240}
        // Sidebar lives on the right edge of the screen — prefer opening to
        // the LEFT so the picker stays on-screen. AutoPopover falls back
        // to bottom/top if there's somehow no room on the left.
        preferredSide="left"
        align="start"
      >
        <HexColorPicker color={empty ? '#000000' : color} onChange={onChange} style={{ width: '100%' }} />
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-7 flex-1 rounded-lg border border-white/10" style={{ backgroundColor: empty ? 'transparent' : color }} />
          <span className="font-mono text-xs text-white/40">{empty ? 'none' : color.toUpperCase()}</span>
        </div>
        {onClear && (
          <button
            onClick={() => { onClear(); setOpen(false) }}
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 py-1.5 text-[11px] text-white/65 hover:bg-white/10 transition"
          >
            No fill
          </button>
        )}
      </AutoPopover>
    </>
  )
}

function SidebarStyles() {
  return (
    <style>{`
      aside { animation: sidebarIn 200ms cubic-bezier(0.22, 1, 0.36, 1); transform-origin: top right; }
      @keyframes sidebarIn {
        from { opacity: 0; transform: translateX(12px); }
        to   { opacity: 1; transform: translateX(0); }
      }
    `}</style>
  )
}
