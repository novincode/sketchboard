'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { useFreeformStore } from '../store'

const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay',
  'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion',
]

export function LayerPanel() {
  const {
    layers,
    activeLayerId,
    addLayer,
    removeLayer,
    setActiveLayerId,
    setLayerVisibility,
    setLayerOpacity,
    setLayerBlendMode,
    setLayerName,
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
      className="fixed right-14 top-3 z-50 flex flex-col rounded-2xl border border-white/10 bg-black/85 shadow-2xl backdrop-blur-xl overflow-hidden"
      style={{ width: 220, maxHeight: 'calc(100vh - 5rem)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
        <span className="text-xs font-semibold text-white/60">Layers</span>
        <button
          onClick={addLayer}
          title="Add layer"
          className="flex h-6 w-6 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Layer list */}
      <div className="flex flex-col overflow-y-auto p-1.5" style={{ maxHeight: 400 }}>
        {reversed.map((layer) => (
          <LayerRow
            key={layer.id}
            id={layer.id}
            name={layer.name}
            visible={layer.visible}
            opacity={layer.opacity}
            blendMode={layer.blendMode}
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

function LayerRow({
  id,
  name,
  visible,
  opacity,
  blendMode,
  isActive,
  canDelete,
  onSelect,
  onVisibilityToggle,
  onDelete,
  onOpacityChange,
  onBlendModeChange,
  onRename,
}: {
  id: string
  name: string
  visible: boolean
  opacity: number
  blendMode: string
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
  const inputRef = useRef<HTMLInputElement>(null)

  const commitRename = () => {
    setEditing(false)
    if (draft.trim()) onRename(draft.trim())
    else setDraft(name)
  }

  useEffect(() => {
    if (editing) {
      setDraft(name)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing, name])

  return (
    <div
      onClick={onSelect}
      className={[
        'group cursor-pointer rounded-xl px-2.5 py-2 flex flex-col gap-1.5 transition-colors mb-0.5',
        isActive ? 'bg-blue-500/15 ring-1 ring-blue-500/25' : 'hover:bg-white/5',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        {/* Visibility */}
        <button
          onClick={(e) => { e.stopPropagation(); onVisibilityToggle() }}
          className="shrink-0 text-white/35 hover:text-white/80 transition"
          title={visible ? 'Hide' : 'Show'}
        >
          {visible ? <Eye size={13} /> : <EyeOff size={13} className="text-white/20" />}
        </button>

        {/* Name — double click to rename */}
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
            className="flex-1 rounded bg-white/10 px-1.5 py-0.5 text-xs text-white outline-none"
          />
        ) : (
          <span
            className="flex-1 text-xs text-white/75 truncate"
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
            title="Double-click to rename"
          >
            {name}
          </span>
        )}

        {/* Delete */}
        {canDelete && !editing && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="hidden shrink-0 text-white/20 hover:text-red-400 transition group-hover:flex"
            title="Delete layer"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Controls visible only on active layer */}
      {isActive && (
        <div className="flex items-center gap-2 pl-5" onClick={(e) => e.stopPropagation()}>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
            className="flex-1 accent-blue-500"
            title={`Opacity: ${Math.round(opacity * 100)}%`}
          />
          <span className="font-mono text-[10px] text-white/25 w-7 text-right">
            {Math.round(opacity * 100)}%
          </span>
        </div>
      )}
      {isActive && (
        <div className="pl-5" onClick={(e) => e.stopPropagation()}>
          <select
            value={blendMode}
            onChange={(e) => onBlendModeChange(e.target.value)}
            className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[11px] text-white/50 outline-none"
          >
            {BLEND_MODES.map((m) => (
              <option key={m} value={m} className="bg-zinc-900">{m}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
