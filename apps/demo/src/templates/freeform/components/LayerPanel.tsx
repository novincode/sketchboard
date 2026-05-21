'use client'

import React, { useRef, useEffect } from 'react'
import { Eye, EyeOff, Plus, Trash2, Layers } from 'lucide-react'
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

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        toggleLayerPanel()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [toggleLayerPanel])

  const reversedLayers = [...layers].reverse() // top layer shown first

  return (
    <div
      ref={ref}
      className="fixed right-4 top-4 z-50 flex flex-col rounded-2xl border border-white/10 bg-black/80 shadow-2xl backdrop-blur-xl"
      style={{ width: 240, maxHeight: 'calc(100vh - 2rem)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-white/50" />
          <span className="text-xs font-semibold text-white/70">Layers</span>
        </div>
        <button
          onClick={addLayer}
          title="Add layer"
          className="flex h-6 w-6 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Layer list */}
      <div className="flex flex-col gap-0.5 overflow-y-auto p-2" style={{ maxHeight: 360 }}>
        {reversedLayers.map((layer) => {
          const isActive = layer.id === activeLayerId
          return (
            <div
              key={layer.id}
              onClick={() => setActiveLayerId(layer.id)}
              className={[
                'group flex cursor-pointer flex-col gap-1 rounded-xl px-3 py-2 transition-colors',
                isActive ? 'bg-blue-500/15 ring-1 ring-blue-500/30' : 'hover:bg-white/5',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                {/* Visibility */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setLayerVisibility(layer.id, !layer.visible)
                  }}
                  className="shrink-0 text-white/40 hover:text-white/80"
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                >
                  {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>

                {/* Name */}
                <input
                  value={layer.name}
                  onChange={(e) => setLayerName(layer.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 bg-transparent text-xs text-white/80 outline-none placeholder:text-white/20"
                />

                {/* Delete */}
                {layers.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeLayer(layer.id)
                    }}
                    className="hidden shrink-0 text-white/20 hover:text-red-400 group-hover:flex"
                    title="Delete layer"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              {/* Opacity + blend mode (only visible on active) */}
              {isActive && (
                <div className="flex items-center gap-2 pl-5">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(layer.opacity * 100)}
                    onChange={(e) => setLayerOpacity(layer.id, Number(e.target.value) / 100)}
                    className="flex-1 accent-blue-500"
                    title={`Opacity: ${Math.round(layer.opacity * 100)}%`}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="font-mono text-[10px] text-white/30 min-w-[28px] text-right">
                    {Math.round(layer.opacity * 100)}%
                  </span>
                </div>
              )}
              {isActive && (
                <div className="pl-5">
                  <select
                    value={layer.blendMode}
                    onChange={(e) => setLayerBlendMode(layer.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/60 outline-none border border-white/10"
                  >
                    {BLEND_MODES.map((m) => (
                      <option key={m} value={m} className="bg-zinc-900">
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
