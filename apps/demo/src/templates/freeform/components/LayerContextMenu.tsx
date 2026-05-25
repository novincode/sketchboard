'use client'

import React from 'react'
import {
  CheckSquare, Copy, Eraser, Bookmark, Folder, FolderOpen,
  Trash2, Scissors, MousePointer2,
} from 'lucide-react'
import { ContextMenu, type ContextMenuEntry } from './ContextMenu'
import { useFreeformStore } from '../store'

/**
 * Single source of truth for the layer-row context menu.
 *
 * Given the current selection (set of layer IDs) the menu derives the right
 * action list once — no per-row if/else branching, no duplicate code in
 * LayerRow vs GroupRow. The actions all call store actions, never reach
 * directly into the Board.
 *
 * Selection-aware:
 *   - 1 layer selected   → "single" mode (rename, duplicate, clear, mask,
 *                          set-as-reference, delete)
 *   - 2+ layers selected → "bulk" mode (group, mask, release-mask, delete-all)
 *   - 1 group selected   → adds "Ungroup"
 *   - Anything maskable  → "Set as Mask" (uses the layer-below rule)
 *   - Anything currently a mask target → "Release Mask"
 *
 * The menu also offers "Select" which flips the panel into selection-mode
 * with checkboxes — for touch users who can't shift-click.
 */
export function LayerContextMenu({
  x, y, onClose, focusedId,
}: {
  x: number; y: number; onClose: () => void
  /**
   * The id of the row the user right-clicked, even if it's not currently in
   * `selectedLayerIds`. We promote it to the selection so single-click menus
   * always make sense.
   */
  focusedId: string
}) {
  const {
    layers, backgroundLayerId, referenceLayerId, selectedLayerIds,
    selectionMode,
    setActiveLayerId, removeLayer, duplicateLayer, clearLayer,
    setReferenceLayerId, groupSelectedLayers, ungroupLayer,
    setSelectionMode,
    maskSelected, releaseMasksFor,
    selectLayer,
    moveLayerOutOfGroup,
  } = useFreeformStore()

  // Effective selection set: include the focused row if not already selected.
  const effective = selectedLayerIds.includes(focusedId) && selectedLayerIds.length > 0
    ? selectedLayerIds
    : [focusedId]
  const acting = effective.filter((id) => id !== backgroundLayerId)
  const single = acting.length === 1 ? acting[0]! : null
  const singleMeta = single ? layers.find((l) => l.id === single) : null
  const isSingleGroup = singleMeta?.type === 'group'
  const isFocusedBackground = focusedId === backgroundLayerId

  // Any selected layer currently being used as a mask target → can be released.
  const hasMaskedTargets = acting.some((id) => {
    const m = layers.find((l) => l.id === id)
    return !!m && m.maskOverlayIds.length > 0
  })

  // Single layer with no mask + a sibling above it OR 2+ layers selected =
  // enough to set up a mask.
  const canMask = (() => {
    if (acting.length >= 2) return true
    if (!single || isFocusedBackground) return false
    const flatIds = layers.filter((l) => l.id !== backgroundLayerId).map((l) => l.id)
    const idx = flatIds.indexOf(single)
    return idx > 0 // there's something "below" in panel order
  })()

  const canDelete = acting.length > 0 && !isFocusedBackground
  const canGroup = acting.length >= 2
  const canUngroup = acting.length === 1 && isSingleGroup
  // "Move out of group" applies when at least one selected layer is currently
  // inside ANY group (parentId != null).
  const insideGroupIds = acting.filter((id) => {
    const m = layers.find((l) => l.id === id)
    return !!m && m.parentId != null
  })
  const canOutdent = insideGroupIds.length > 0

  const entries: ContextMenuEntry[] = []

  // Toggle selection mode (most useful for touch).
  entries.push({
    label: selectionMode ? 'Exit selection' : 'Select…',
    icon: <CheckSquare size={13} />,
    onClick: () => setSelectionMode(!selectionMode),
  })

  if (single && !isFocusedBackground && !isSingleGroup) {
    entries.push({ label: 'Duplicate', icon: <Copy size={13} />,   onClick: () => duplicateLayer(single) })
    entries.push({ label: 'Clear',     icon: <Eraser size={13} />, onClick: () => clearLayer(single) })
  }

  if (acting.length > 0) {
    entries.push({ separator: true })
  }

  if (canGroup) {
    entries.push({
      label: `Group ${acting.length} layers`,
      icon: <Folder size={13} />, shortcut: '⌘G',
      onClick: () => groupSelectedLayers(),
    })
  }
  if (canUngroup) {
    entries.push({
      label: 'Ungroup',
      icon: <FolderOpen size={13} />, shortcut: '⌘⇧G',
      onClick: () => ungroupLayer(single!),
    })
  }
  if (canOutdent) {
    entries.push({
      label: insideGroupIds.length > 1 ? `Move ${insideGroupIds.length} out of group` : 'Move out of group',
      icon: <FolderOpen size={13} />,
      onClick: () => { for (const id of insideGroupIds) moveLayerOutOfGroup(id) },
    })
  }

  if (canMask) {
    entries.push({
      label: acting.length >= 2
        ? 'Clipping mask (top clips to bottom)'
        : 'Clip to layer below',
      icon: <Scissors size={13} />,
      onClick: () => {
        if (!selectedLayerIds.includes(focusedId)) selectLayer(focusedId, false)
        maskSelected()
      },
    })
  }
  if (hasMaskedTargets) {
    entries.push({
      label: 'Release clipping mask',
      icon: <Scissors size={13} />,
      onClick: () => releaseMasksFor(acting),
    })
  }

  if (single && !isFocusedBackground) {
    const isRef = referenceLayerId === single
    entries.push({
      label: isRef ? 'Remove reference' : 'Set as reference',
      icon: <Bookmark size={13} />,
      onClick: () => setReferenceLayerId(isRef ? null : single),
    })
  }

  if (canDelete) {
    entries.push({ separator: true })
    entries.push({
      label: acting.length > 1 ? `Delete ${acting.length} layers` : 'Delete',
      icon: <Trash2 size={13} />, danger: true,
      onClick: () => { for (const id of acting) removeLayer(id) },
    })
  }

  if (isFocusedBackground) {
    // Limited menu for the background — only allow selection-mode toggle.
    entries.push({
      label: 'Make active',
      icon: <MousePointer2 size={13} />,
      onClick: () => setActiveLayerId(focusedId),
    })
  }

  return <ContextMenu x={x} y={y} entries={entries} onClose={onClose} />
}
