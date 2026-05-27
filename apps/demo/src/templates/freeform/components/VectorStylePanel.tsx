'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HexColorPicker } from 'react-colorful'
import type { SelectTool } from '@sketchboard/core'
import { useFreeformStore } from '../store'
import { DraggableInput } from './DraggableInput'

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
  const [hasRasterLasso, setHasRasterLasso] = useState(false)

  useEffect(() => {
    if (!board) { setStyle(null); setHasRasterLasso(false); return }
    const select = board.getTool<SelectTool>('select')
    if (!select) { setStyle(null); setHasRasterLasso(false); return }

    const refresh = () => {
      setStyle(select.getElementStyle())
      setHasRasterLasso(select.getRasterLassoSelection() !== null)
    }
    const unsub = board.hooks.selectionChanged.tap('vector-style-sidebar', refresh)
    // Also refresh on activeLayer changes — if the user manually changes the
    // active layer in the panel, the current selection may now point at a
    // different layer's elements (shouldn't, but we want to stay safe).
    const unsubLayer = board.hooks.activeLayerChanged.tap('vector-style-sidebar', refresh)
    refresh()
    return () => { unsub(); unsubLayer() }
  }, [board])

  // Only show on selection-capable tools.
  const toolOk = activeToolId === 'select' || activeToolId === 'lasso' || activeToolId === 'vectorpen'
  if (!toolOk) return null
  if (!style && !hasRasterLasso) return null

  return <Sidebar style={style} hasRasterLasso={hasRasterLasso} board={board!} />
}

function Sidebar({ style, hasRasterLasso, board }: {
  style: ReturnType<SelectTool['getElementStyle']>
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
  color, mixed, empty, onChange, onClear, direction,
}: {
  color: string
  mixed: boolean
  empty?: boolean
  onChange: (hex: string) => void
  onClear?: () => void
  /** Where to position the popover relative to the swatch. */
  direction: 'down' | 'left'
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const rect = triggerRef.current?.getBoundingClientRect()
  const popWidth = 240
  // Sidebar is on the right; popover should open LEFT of the swatch so it
  // doesn't fall off-screen. `down` keeps default behavior for flexible callers.
  const popLeft = rect
    ? (direction === 'left' ? rect.left - popWidth - 8 : rect.left)
    : 0
  const popTop = rect ? rect.bottom + 6 : 0

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((p) => !p)}
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

      {open && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[10100] rounded-2xl border border-white/10 bg-[#1a1a1a]/95 p-3 shadow-2xl backdrop-blur-xl"
          style={{ left: popLeft, top: popTop, width: popWidth }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
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
        </div>,
        document.body,
      )}
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
