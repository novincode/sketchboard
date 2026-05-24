'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HexColorPicker } from 'react-colorful'
import type { SelectTool } from '@sketchboard/core'
import { useFreeformStore } from '../store'
import { DraggableInput } from './DraggableInput'

/**
 * Floating panel for editing the stroke/fill style of selected vector
 * elements (strokes from the vector brush, or paths from the vector pen).
 *
 * Shown only while SelectTool has at least one vector element selected.
 * Reads/writes through the tool's public getElementStyle / setElementStyle
 * API — no direct VectorLayer mutation, so undo/redo is one entry per edit.
 *
 * Subscribes to Board.hooks.afterRender to detect selection changes (only
 * fires on dirty frames; cheap) plus a shallow id comparison so we re-render
 * only when the selection actually changes shape.
 */
export function VectorStylePanel() {
  const board = useFreeformStore((s) => s.board)
  const activeToolId = useFreeformStore((s) => s.activeToolId)

  const [style, setStyle] = useState<ReturnType<SelectTool['getElementStyle']>>(null)
  const lastIdsKeyRef = useRef<string>('')

  useEffect(() => {
    if (!board) { setStyle(null); return }
    const select = board.getTool<SelectTool>('select')
    if (!select) { setStyle(null); return }

    const refresh = () => {
      const ids = select.getSelectedIds()
      const key = ids.join(',')
      const idsChanged = key !== lastIdsKeyRef.current
      const next = select.getElementStyle()
      // Always refresh when ids change; also refresh on style mutation
      // (compare by JSON since the object's fields are primitive).
      if (idsChanged) {
        lastIdsKeyRef.current = key
        setStyle(next)
      } else {
        setStyle((prev) => {
          if (!prev && !next) return prev
          if (!prev || !next) return next
          if (prev.strokeColor === next.strokeColor && prev.strokeWidth === next.strokeWidth
            && prev.fillColor === next.fillColor && prev.opacity === next.opacity) return prev
          return next
        })
      }
    }

    const unsub = board.hooks.afterRender.tap('vector-style-panel', refresh)
    refresh()
    return () => unsub()
  }, [board])

  // Hide while we're not in select-ish modes — keeps the canvas uncluttered
  // when the user is actively drawing.
  if (!style) return null
  if (activeToolId !== 'select' && activeToolId !== 'lasso' && activeToolId !== 'vectorpen') return null

  return createPortal(
    <Panel style={style} board={board!} />,
    document.body,
  )
}

function Panel({ style, board }: {
  style: NonNullable<ReturnType<SelectTool['getElementStyle']>>
  board: NonNullable<ReturnType<typeof useFreeformStore.getState>['board']>
}) {
  const [strokeOpen, setStrokeOpen] = useState(false)
  const [fillOpen, setFillOpen] = useState(false)
  const select = board.getTool<SelectTool>('select')
  if (!select) return null

  const apply = (patch: Parameters<SelectTool['setElementStyle']>[0]) => {
    select.setElementStyle(patch)
  }

  const stroke = style.strokeColor ?? '#000000'
  const fill = style.fillColor

  return (
    <div
      className="fixed z-[9500] flex items-center gap-2 rounded-2xl border border-white/10 bg-[#111]/95 px-3 py-2 shadow-2xl backdrop-blur-xl select-none"
      style={{ right: 12, top: 76 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="text-[9px] uppercase tracking-widest text-white/35 font-semibold mr-1">Style</span>

      {/* Stroke swatch */}
      <Swatch
        label="Stroke"
        color={stroke}
        mixed={style.mixedStrokeColor}
        open={strokeOpen}
        onToggle={() => { setStrokeOpen((p) => !p); setFillOpen(false) }}
        onChange={(hex) => apply({ strokeColor: hex })}
      />

      {/* Fill swatch — only meaningful for paths (strokes have no fill). */}
      <Swatch
        label="Fill"
        color={fill ?? 'transparent'}
        mixed={style.mixedFillColor}
        empty={fill === null}
        open={fillOpen}
        onToggle={() => { setFillOpen((p) => !p); setStrokeOpen(false) }}
        onChange={(hex) => apply({ fillColor: hex })}
        onClear={() => apply({ fillColor: null })}
      />

      <Sep />

      <DraggableInput
        label="Width"
        value={Math.round(style.strokeWidth * 10) / 10}
        min={0}
        max={120}
        unit="px"
        onChange={(v) => apply({ strokeWidth: v })}
      />

      <Sep />

      <DraggableInput
        label="Opacity"
        value={Math.round(style.opacity * 100)}
        min={0}
        max={100}
        unit="%"
        onChange={(v) => apply({ opacity: v / 100 })}
      />
    </div>
  )
}

function Sep() {
  return <div className="h-5 w-px shrink-0 rounded bg-white/12" />
}

function Swatch({
  label, color, mixed, empty, open, onToggle, onChange, onClear,
}: {
  label: string
  color: string
  mixed: boolean
  empty?: boolean
  open: boolean
  onToggle: () => void
  onChange: (hex: string) => void
  onClear?: () => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onToggle()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onToggle])

  // Position popover below the trigger.
  const rect = triggerRef.current?.getBoundingClientRect()
  const popLeft = rect ? rect.left : 0
  const popTop = rect ? rect.bottom + 6 : 0

  return (
    <>
      <button
        ref={triggerRef}
        onClick={onToggle}
        title={label + (mixed ? ' (mixed)' : '')}
        className={[
          'flex items-center gap-1 rounded-lg border px-1.5 py-1 transition',
          open ? 'border-blue-400/60 bg-blue-500/10' : 'border-white/10 bg-white/5 hover:border-white/25',
        ].join(' ')}
      >
        <span
          className="h-4 w-4 rounded-sm border border-white/20"
          style={{
            backgroundColor: empty ? 'transparent' : color,
            backgroundImage: empty
              ? 'linear-gradient(135deg, transparent 45%, rgba(255,0,0,0.7) 47%, rgba(255,0,0,0.7) 53%, transparent 55%)'
              : mixed
              ? 'linear-gradient(45deg, rgba(0,0,0,0.4) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.4) 75%)'
              : undefined,
            backgroundSize: empty ? undefined : mixed ? '6px 6px' : undefined,
          }}
        />
        <span className="text-[9px] uppercase tracking-widest text-white/55 font-semibold">{label}</span>
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[10100] rounded-2xl border border-white/10 bg-[#1a1a1a]/95 p-3 shadow-2xl backdrop-blur-xl"
          style={{ left: popLeft, top: popTop, width: 240 }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-2 text-[10px] uppercase tracking-widest text-white/30 font-semibold">{label}</p>
          <HexColorPicker color={empty ? '#000000' : color} onChange={onChange} style={{ width: '100%' }} />
          <div className="mt-2.5 flex items-center gap-2">
            <div className="h-7 flex-1 rounded-lg border border-white/10" style={{ backgroundColor: empty ? 'transparent' : color }} />
            <span className="font-mono text-xs text-white/40">{empty ? 'none' : color.toUpperCase()}</span>
          </div>
          {onClear && (
            <button
              onClick={() => { onClear(); onToggle() }}
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 py-1.5 text-[11px] text-white/65 hover:bg-white/10 transition"
            >
              No {label.toLowerCase()}
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
