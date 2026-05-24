'use client'

import React from 'react'
import { useFreeformStore } from '../store'
import { ToleranceBar } from './ToleranceBar'

/**
 * Top-of-screen HUD shown while the bucket-fill tool (or ColorDrop) is being
 * scrubbed. Pure leaf wrapper — subscribes only to the single tolerance value
 * so unrelated store updates don't re-render the bar mid-scrub.
 */
export function FillToleranceHud() {
  // Narrow subscription: we only re-render when the numeric tolerance changes.
  const tolerance = useFreeformStore((s) => s.fillPreview?.tolerance)
  if (tolerance == null) return null
  const pct = (tolerance / 255) * 100
  return <ToleranceBar label="Fill tolerance" pct={pct} />
}
