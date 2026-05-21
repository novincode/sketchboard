'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  Eye, EyeOff, Plus, Trash2, Layers, PenLine,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { useFreeformStore } from '../store'
import type { LayerType } from '../types'

const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay',
  'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion',
]

export function LayerPanel() {
  const {
    layers, activeLayerId, addLayer,
    removeLayer, setActiveLayerId,
    setLayerVisibility, setLayerOpacity,
    setLayerBlendMode, setLayerName,
    toggleLayerPanel,
  } = useFreeformStore()

  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) toggleLayerPanel()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [toggleLayerPanel])

  const reversed = [...layers].reverse()

  return (
    <div
      ref={ref}
      className="fixed right-3 top-14 z-50 flex flex-col rounded-2xl border border-white/10 bg-[#111]/90 shadow-2xl backdrop-blur-xl overflow-hidden"
      style={{ width: 280, maxHeight: 'calc(100vh - 5.5rem)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <span className="text-xs font-semibold text-white/70 tracking-wide">Layers</span>
        <div className="flex items-center gap-1">
          <AddBtn onClick={() => addLayer('raster')} label="Add Raster Layer" icon={<Layers size={12} />} />
          <AddBtn onClick={() => addLayer('vector')} label="Add Vector Layer" icon={<PenLine size={12} />} />
        </div>
      </div>

      {/* Layer list */}
      <div className="flex flex-col overflow-y-auto p-2 gap-1">
        {reversed.map((layer) => (
          <LayerRow
            key={layer.id}
            id={layer.id}
            name={layer.name}
            visible={layer.visible}
            opacity={layer.opacity}
            blendMode={layer.blendMode}
            layerType={layer.type}
            isActive={layer.id === activeLayerId}
            canDelete={layers.length > 1}
            onSelect={() => setActiveLayerId(layer.id)}
            onVisibilityToggle={() => setLayerVisibility(layer.id, !layer.visible)}
            onDelete={() => removeLayer(layer.id)}
            onOpacityChange={(v) => setLayerOpacity(layer.id, v)}
            onBlendModeChange={(m) => setLayerBlendMode(layer.id, m)}
            onRename={(n) => setLayerName(layer.id, n)}
          />
        ))}
      </div>
    </div>
  )
}

function AddBtn({ onClick, label, icon }: { onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/45 hover:bg-white/10 hover:text-white/80 transition"
    >
      {icon}
    </button>
  )
}

function LayerRow({
  id, name, visible, opacity, blendMode, layerType,
  isActive, canDelete,
  onSelect, onVisibilityToggle, onDelete,
  onOpacityChange, onBlendModeChange, onRename,
}: {
  id: string
  name: string
  visible: boolean
  opacity: number
  blendMode: string
  layerType: LayerType
  isActive: boolean
  canDelete: boolean
  onSelect: () => void
  onVisibilityToggle: () => void
  onDelete: () => void
  onOpacityChange: (v: number) => void
  onBlendModeChange: (m: string) => void
  onRename: (n: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const commitRename = () => {
    setEditing(false)
    if (draft.trim()) onRename(draft.trim())
    else setDraft(name)
  }

  useEffect(() => {
    if (editing) { setDraft(name); inputRef.current?.focus(); inputRef.current?.select() }
  }, [editing, name])

  return (
    <div
      className={[
        'group rounded-xl transition-colors overflow-hidden',
        isActive
          ? 'bg-white/8 ring-1 ring-white/20'
          : 'hover:bg-white/4',
      ].join(' ')}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer"
        onClick={onSelect}
      >
        {/* Layer type badge */}
        <span
          className={[
            'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
            layerType === 'vector'
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-blue-500/15 text-blue-400/80',
          ].join(' ')}
        >
          {layerType === 'vector' ? 'VEC' : 'PX'}
        </span>

        {/* Name */}
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { setEditing(false); setDraft(name) }
              e.stopPropagation()
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 rounded-lg bg-white/10 px-2 py-0.5 text-xs text-white outline-none"
          />
        ) : (
          <span
            className="flex-1 text-sm text-white/80 truncate font-medium"
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
            title="Double-click to rename"
          >
            {name}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onVisibilityToggle}
            className="text-white/30 hover:text-white/80 transition p-0.5"
            title={visible ? 'Hide' : 'Show'}
          >
            {visible ? <Eye size={14} /> : <EyeOff size={14} className="text-white/20" />}
          </button>

          {isActive && (
            <button
              onClick={() => setExpanded((x) => !x)}
              className="text-white/25 hover:text-white/60 transition p-0.5"
              title="Layer options"
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}

          {canDelete && !editing && (
            <button
              onClick={onDelete}
              className="hidden text-white/20 hover:text-red-400 transition group-hover:flex p-0.5"
              title="Delete layer"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded options (only for active layer) */}
      {isActive && expanded && (
        <div
          className="flex flex-col gap-2 px-4 pb-3 border-t border-white/6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Opacity */}
          <div className="flex items-center gap-2 pt-2">
            <span className="text-[10px] text-white/35 w-14 shrink-0">Opacity</span>
            <input
              type="range" min={0} max={100}
              value={Math.round(opacity * 100)}
              onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
              className="flex-1 accent-white h-1"
            />
            <span className="font-mono text-[10px] text-white/30 w-8 text-right">
              {Math.round(opacity * 100)}%
            </span>
          </div>

          {/* Blend mode */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/35 w-14 shrink-0">Blend</span>
            <select
              value={blendMode}
              onChange={(e) => onBlendModeChange(e.target.value)}
              className="flex-1 rounded-lg bg-white/6 border border-white/8 px-2 py-1 text-[11px] text-white/55 outline-none"
            >
              {BLEND_MODES.map((m) => (
                <option key={m} value={m} className="bg-zinc-900">{m}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
