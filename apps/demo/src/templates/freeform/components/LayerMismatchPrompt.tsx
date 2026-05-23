'use client'

import React, { useCallback, useState } from 'react'
import { AlertTriangle, Plus, Layers, PenLine, ChevronDown } from 'lucide-react'
import { useFreeformStore } from '../store'
import type { LayerType } from '../types'
import { VECTOR_TOOLS } from '../types'

export function LayerMismatchPrompt() {
  const { activeToolId, layers, activeLayerId, backgroundLayerId, addLayer, setActiveLayerId } = useFreeformStore()
  const [showList, setShowList] = useState(false)

  // ALL hooks before any conditional returns
  const activeLayer = layers.find((l) => l.id === activeLayerId)
  const needsVector = VECTOR_TOOLS.includes(activeToolId)
  // Eraser works on both raster and vector layers — don't flag it as a mismatch
  const needsRaster = ['pen', 'brush'].includes(activeToolId)
  const mismatch =
    (needsVector && activeLayer?.type === 'raster') ||
    (needsRaster && activeLayer?.type === 'vector')

  const neededType: LayerType = needsVector ? 'vector' : 'raster'
  // All candidate layers (not the active one, not the background)
  const candidates = layers.filter(
    (l) => l.type === neededType && l.id !== activeLayerId && l.id !== backgroundLayerId,
  )

  const handleCreate = useCallback(() => addLayer(neededType), [addLayer, neededType])

  if (!mismatch) return null

  const TypeIcon = neededType === 'vector' ? PenLine : Layers
  const typeLabel = neededType === 'vector' ? 'Vector' : 'Raster'

  return (
    <div className="pointer-events-auto fixed bottom-20 left-1/2 z-50 -translate-x-1/2">
      <div className="relative flex items-center gap-2.5 rounded-2xl border border-amber-500/25 bg-black/92 px-4 py-3 shadow-2xl backdrop-blur-xl">
        <AlertTriangle size={14} className="text-amber-400 shrink-0" />

        <span className="text-xs text-white/55 whitespace-nowrap">
          <span className="text-amber-400 font-medium capitalize">{activeToolId}</span>
          {' '}needs a <span className="text-white/80">{typeLabel}</span> layer
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Switch to existing layer — if one or more exist */}
          {candidates.length === 1 && (
            <button
              onClick={() => setActiveLayerId(candidates[0]!.id)}
              className="flex items-center gap-1.5 rounded-lg bg-white/8 border border-white/10 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/15 hover:text-white transition whitespace-nowrap"
            >
              <TypeIcon size={11} />
              {candidates[0]!.name}
            </button>
          )}

          {/* Multiple candidates — show dropdown */}
          {candidates.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowList((p) => !p)}
                className="flex items-center gap-1.5 rounded-lg bg-white/8 border border-white/10 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/15 hover:text-white transition"
              >
                Switch layer <ChevronDown size={11} />
              </button>
              {showList && (
                <div className="absolute bottom-full mb-1.5 left-0 min-w-35 rounded-xl border border-white/10 bg-[#1a1a1a]/98 overflow-hidden shadow-2xl backdrop-blur-xl">
                  {candidates.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => { setActiveLayerId(l.id); setShowList(false) }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-white/60 hover:bg-white/8 hover:text-white transition"
                    >
                      <TypeIcon size={11} className={neededType === 'vector' ? 'text-purple-400' : 'text-blue-400'} />
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Create new */}
          <button
            onClick={handleCreate}
            className="flex items-center gap-1 rounded-lg bg-blue-500/15 border border-blue-500/25 px-2.5 py-1 text-[11px] text-blue-300 hover:bg-blue-500/30 transition whitespace-nowrap"
          >
            <Plus size={10} />
            New {typeLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
