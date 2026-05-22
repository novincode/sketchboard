'use client'

import React, { useCallback } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { useFreeformStore } from '../store'
import type { LayerType } from '../types'
import { VECTOR_TOOLS } from '../types'

export function LayerMismatchPrompt() {
  const { activeToolId, layers, activeLayerId, addLayer, setActiveLayerId } = useFreeformStore()

  // ALL hooks must come before any conditional returns
  const activeLayer = layers.find((l) => l.id === activeLayerId)

  const needsVector = VECTOR_TOOLS.includes(activeToolId)
  const needsRaster = ['pen', 'brush', 'eraser'].includes(activeToolId)
  const mismatch =
    (needsVector && activeLayer?.type === 'raster') ||
    (needsRaster && activeLayer?.type === 'vector')

  const neededType: LayerType = needsVector ? 'vector' : 'raster'
  const existingMatch = layers.find((l) => l.type === neededType && l.id !== activeLayerId)

  const handleCreate = useCallback(() => addLayer(neededType), [addLayer, neededType])
  const handleSwitch = useCallback(() => {
    if (existingMatch) setActiveLayerId(existingMatch.id)
  }, [existingMatch, setActiveLayerId])

  if (!mismatch) return null

  return (
    <div className="pointer-events-auto fixed bottom-20 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-black/90 px-4 py-3 shadow-2xl backdrop-blur-xl max-w-xs">
        <AlertTriangle size={15} className="text-amber-400 shrink-0" />
        <span className="text-xs text-white/65 shrink min-w-0">
          <span className="text-amber-400 font-medium capitalize">{activeToolId}</span>
          {' '}needs a {neededType} layer
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {existingMatch && (
            <button
              onClick={handleSwitch}
              className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] text-white/65 hover:bg-white/20 hover:text-white transition whitespace-nowrap"
            >
              "{existingMatch.name}"
            </button>
          )}
          <button
            onClick={handleCreate}
            className="flex items-center gap-1 rounded-lg bg-blue-500/20 border border-blue-500/30 px-2.5 py-1 text-[11px] text-blue-300 hover:bg-blue-500/35 transition whitespace-nowrap"
          >
            <Plus size={10} />
            New
          </button>
        </div>
      </div>
    </div>
  )
}
