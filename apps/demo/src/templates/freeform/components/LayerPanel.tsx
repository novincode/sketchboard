'use client'

import React, { useEffect, useMemo, useRef, useState, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Eye, EyeOff, Plus, Layers, PenLine,
  ChevronDown, ChevronRight, Bookmark,
  Folder, FolderOpen, Scissors, Check, CheckSquare, Square,
} from 'lucide-react'
import { HexColorPicker } from 'react-colorful'
import {
  DndContext, MouseSensor, TouchSensor, useSensor, useSensors,
  DragOverlay, pointerWithin, useDroppable,
  type DragStartEvent, type DragEndEvent, type DragOverEvent, type CollisionDetection,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useFreeformStore } from '../store'
import { DraggableInput } from './DraggableInput'
import { LayerContextMenu } from './LayerContextMenu'

const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay',
  'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion',
]

const INDENT_PX = 16

// ─── Drop targets ──────────────────────────────────────────────────────────────
/**
 * Distinct droppable targets the panel exposes during a drag:
 *
 *   row::<id>::before        Insert above this row, same parent
 *   row::<id>::after         Insert below this row, same parent
 *   group::<id>::into        Drop into this group as the new top child
 *   root::end                Append to root (always-visible bottom strip)
 *   root::start              Insert at top of root (just below Background)
 *
 * Using string-coded ids lets us read intent without juggling extra state —
 * the active droppable is whichever the cursor is over according to the
 * dnd-kit collision detector. Each target is rendered as a small invisible
 * `<DropZone>` so dnd-kit's collision system finds it.
 */
type DropTargetId = string

function dropId(kind: 'before' | 'after', rowId: string): DropTargetId { return `row::${rowId}::${kind}` }
function intoId(groupId: string): DropTargetId { return `group::${groupId}::into` }
const ROOT_START: DropTargetId = 'root::start'
const ROOT_END: DropTargetId = 'root::end'

// Custom collision detection: prefer pointer-within (matches the cursor's
// exact position vs. the droppable rect) for snappy precision, then fall
// back to the closest center if no zone contains the pointer. This is the
// dnd-kit recommended pattern for "interactive layout" cases like ours.
const collisionDetection: CollisionDetection = (args) => {
  // Try pointer-within first; if it finds nothing, fall back to the
  // sortable items themselves (which dnd-kit ranks by closest-center).
  const within = pointerWithin(args)
  if (within.length > 0) return within
  // No drop zone hit — but the user might be hovering a row directly.
  // Return [] so dnd-kit reports `over = null`, and our active-drag
  // panel listener can decide what to do (e.g. show the root-end hint).
  return []
}

// ─── LayerPanel ───────────────────────────────────────────────────────────────

export function LayerPanel() {
  const {
    layers, activeLayerId, backgroundLayerId, backgroundLayerColor,
    referenceLayerId, selectedLayerIds, selectionMode,
    addLayer, removeLayer, duplicateLayer, clearLayer,
    selectLayer, selectRange, toggleLayerInSelection,
    setLayerVisibility, setLayerOpacity,
    setLayerBlendMode, setLayerName, setBackgroundColor,
    setReferenceLayerId,
    groupSelectedLayers, ungroupLayer, toggleGroupCollapsed,
    moveLayer, reorderSiblings, joinMask,
    toggleLayerPanel,
  } = useFreeformStore()

  const ref = useRef<HTMLDivElement>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [overDropId, setOverDropId] = useState<DropTargetId | null>(null)

  // Auto-expand collapsed groups when hovered for >= AUTO_EXPAND_MS (Figma-style).
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastHoveredGroupRef = useRef<string | null>(null)
  const AUTO_EXPAND_MS = 600

  // Click-outside dismisses the panel.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) toggleLayerPanel()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [toggleLayerPanel])

  // Visual order = tree, with each parent's siblings reversed so the top of
  // panel is the topmost layer. Background is special-cased and always pinned
  // to the bottom of the list (it's the bottom of the canvas).
  const displayOrder = useMemo(() => reverseSiblings(layers), [layers])
  const sortableIds = useMemo(() =>
    displayOrder.filter((l) => l.id !== backgroundLayerId).map((l) => l.id),
  [displayOrder, backgroundLayerId])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 240, tolerance: 6 } }),
  )

  const onDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id))
    setOverDropId(null)
  }

  const onDragOver = (e: DragOverEvent) => {
    const over = e.over
    if (!over) { setOverDropId(null); cancelAutoExpand(); return }
    const id = String(over.id) as DropTargetId
    if (id === overDropId) return
    setOverDropId(id)
    handleAutoExpand(id)
  }

  const handleAutoExpand = (id: DropTargetId) => {
    if (id.startsWith('group::') && id.endsWith('::into')) {
      const groupId = id.slice('group::'.length, -'::into'.length)
      const meta = layers.find((l) => l.id === groupId)
      if (meta?.type === 'group' && meta.collapsed) {
        if (lastHoveredGroupRef.current === groupId) return  // already armed
        cancelAutoExpand()
        lastHoveredGroupRef.current = groupId
        autoExpandTimerRef.current = setTimeout(() => {
          toggleGroupCollapsed(groupId)
        }, AUTO_EXPAND_MS)
        return
      }
    }
    cancelAutoExpand()
  }

  const cancelAutoExpand = () => {
    if (autoExpandTimerRef.current) clearTimeout(autoExpandTimerRef.current)
    autoExpandTimerRef.current = null
    lastHoveredGroupRef.current = null
  }

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id)
    const target = overDropId
    cancelAutoExpand()
    setActiveDragId(null)
    setOverDropId(null)
    if (!target) return
    if (target === `row::${activeId}::before` || target === `row::${activeId}::after`) return

    const activeMeta = layers.find((l) => l.id === activeId)
    if (!activeMeta) return

    // ── root::end / root::start: move to root, append (or insert at top after BG) ──
    if (target === ROOT_END) {
      const rootSiblings = layers.filter((l) => l.parentId == null)
      moveLayer(activeId, null, rootSiblings.length)
      return
    }
    if (target === ROOT_START) {
      // "Top of panel" = end of root in tree order (panel reverses).
      // BG layer is at root index 0; we insert at end of root so it shows at top.
      const rootSiblings = layers.filter((l) => l.parentId == null)
      moveLayer(activeId, null, rootSiblings.length)
      return
    }

    // ── group::<id>::into ──
    if (target.startsWith('group::') && target.endsWith('::into')) {
      const groupId = target.slice('group::'.length, -'::into'.length)
      const groupMeta = layers.find((l) => l.id === groupId)
      if (!groupMeta || groupMeta.type !== 'group') return
      // Insert at the TOP of the group's children (= end of tree-order children
      // because panel reverses siblings).
      const childCount = layers.filter((l) => l.parentId === groupId).length
      moveLayer(activeId, groupId, childCount)
      return
    }

    // ── row::<id>::before / row::<id>::after ──
    if (target.startsWith('row::')) {
      const parts = target.split('::')
      const overId = parts[1]!
      const pos = parts[2] as 'before' | 'after'
      const overMeta = layers.find((l) => l.id === overId)
      if (!overMeta || overId === activeId) return

      // Mask-stack join: if the user dropped into the visible gap between
      // a layer and the layer below it that is already a mask base for the
      // layer above, attach the active layer to the SAME mask target.
      const panelIds = displayOrder.filter((l) => l.id !== backgroundLayerId).map((l) => l.id)
      const overPanelIdx = panelIds.indexOf(overId)
      if (overPanelIdx !== -1) {
        const aboveId = pos === 'before' ? panelIds[overPanelIdx - 1] : overId
        const belowId = pos === 'before' ? overId : panelIds[overPanelIdx + 1]
        const aboveMeta = aboveId ? layers.find((l) => l.id === aboveId) : null
        const belowMeta = belowId ? layers.find((l) => l.id === belowId) : null
        if (aboveMeta && belowMeta && belowMeta.maskOverlayIds.includes(aboveMeta.id)) {
          joinMask(belowMeta.id, activeId)
          return
        }
      }

      const parentId = overMeta.parentId
      const parentLayers = layers.filter((l) => l.parentId === parentId)
      const treeOrderIds = parentLayers.map((l) => l.id)
      const filtered = treeOrderIds.filter((id) => id !== activeId)
      const overIdx = filtered.indexOf(overId)
      // Panel reverses sibling order, so:
      //   pos 'before' (above overRow in panel)  → AFTER overRow in tree
      //   pos 'after'  (below overRow in panel)  → BEFORE overRow in tree
      const insertAt = pos === 'before' ? overIdx + 1 : overIdx

      if (activeMeta.parentId !== parentId) {
        moveLayer(activeId, parentId, insertAt)
      } else {
        const newOrder = [...filtered]
        newOrder.splice(insertAt, 0, activeId)
        reorderSiblings(newOrder, parentId)
      }
    }
  }

  const activeMeta = activeDragId ? layers.find((l) => l.id === activeDragId) : null
  const activeDragInsideGroup = !!activeMeta && activeMeta.parentId != null

  return (
    <div
      ref={ref}
      data-layer-panel
      className="fixed right-3 top-14 z-50 flex flex-col rounded-2xl border border-white/10 bg-[#111]/92 shadow-2xl backdrop-blur-xl overflow-hidden layer-panel-enter select-none"
      style={{ width: 296, maxHeight: 'calc(100vh - 5.5rem)' }}
    >
      <PanelStyles />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/70 tracking-wide">Layers</span>
          {selectionMode && (
            <span className="rounded-md bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
              {selectedLayerIds.filter((id) => id !== backgroundLayerId).length} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => useFreeformStore.getState().setSelectionMode(!selectionMode)}
            className={[
              'flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] transition',
              selectionMode
                ? 'border-blue-400/60 bg-blue-500/15 text-blue-200'
                : 'border-white/10 bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/80',
            ].join(' ')}
            title={selectionMode ? 'Exit selection' : 'Select multiple layers'}
          >
            {selectionMode ? <CheckSquare size={12} /> : <Square size={12} />}
          </button>
          <button
            onClick={groupSelectedLayers}
            disabled={selectedLayerIds.filter((id) => id !== backgroundLayerId).length === 0}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/45 hover:bg-white/10 hover:text-white/80 disabled:opacity-30 disabled:hover:bg-white/5 disabled:cursor-default transition"
            title="Group selected (⌘G)"
          >
            <Folder size={12} />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowAddMenu((p) => !p)}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/45 hover:bg-white/10 hover:text-white/80 transition"
              title="Add layer"
            >
              <Plus size={12} />
            </button>
            {showAddMenu && (
              <div
                className="absolute right-0 top-full mt-1.5 z-10 flex flex-col rounded-xl border border-white/10 bg-[#1a1a1a]/98 overflow-hidden shadow-2xl backdrop-blur-xl"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => { addLayer('raster'); setShowAddMenu(false) }}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-white/60 hover:bg-white/8 hover:text-white/90 transition whitespace-nowrap"
                >
                  <Layers size={13} className="text-blue-400/70" />
                  <span>Raster Layer</span>
                  <kbd className="ml-auto rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-mono text-white/25">PX</kbd>
                </button>
                <button
                  onClick={() => { addLayer('vector'); setShowAddMenu(false) }}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-white/60 hover:bg-white/8 hover:text-white/90 transition whitespace-nowrap"
                >
                  <PenLine size={13} className="text-purple-400/70" />
                  <span>Vector Layer</span>
                  <kbd className="ml-auto rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-mono text-white/25">VEC</kbd>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Layer list — scrollable */}
      <div className="flex flex-col overflow-y-auto min-h-0">
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => { cancelAutoExpand(); setActiveDragId(null); setOverDropId(null) }}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col p-2 gap-0.5">
              {/* ROOT START — pinned at very top of panel. Only an active drop
                  target during a drag; otherwise zero-height for layout. */}
              {activeDragId && (
                <PanelDropZone
                  id={ROOT_START}
                  active={overDropId === ROOT_START}
                  hint="Move to top of root"
                />
              )}

              {displayOrder.map((meta) => {
                const isBg = meta.id === backgroundLayerId
                if (isBg) {
                  return (
                    <BackgroundLayerRow
                      key={meta.id}
                      color={backgroundLayerColor}
                      visible={meta.visible}
                      isActive={meta.id === activeLayerId}
                      onSelect={() => selectLayer(meta.id, false)}
                      onVisibilityToggle={() => setLayerVisibility(meta.id, !meta.visible)}
                      onColorChange={setBackgroundColor}
                    />
                  )
                }
                if (meta.type === 'group') {
                  return (
                    <SortableGroupRow
                      key={meta.id}
                      id={meta.id}
                      name={meta.name}
                      depth={meta.depth}
                      visible={meta.visible}
                      opacity={meta.opacity}
                      collapsed={!!meta.collapsed}
                      childCount={meta.childCount ?? 0}
                      isActive={meta.id === activeLayerId}
                      isSelected={selectedLayerIds.includes(meta.id)}
                      activeDragId={activeDragId}
                      overDropId={overDropId}
                      selectionMode={selectionMode}
                      isReference={meta.id === referenceLayerId}
                      maskOverlayIds={meta.maskOverlayIds}
                      maskTargetIds={meta.maskTargetIds}
                      onSelect={(e) => onSelect(e, meta.id, selectionMode, selectLayer, selectRange, toggleLayerInSelection)}
                      onToggleCollapsed={() => toggleGroupCollapsed(meta.id)}
                      onVisibilityToggle={() => setLayerVisibility(meta.id, !meta.visible)}
                      onRename={(n) => setLayerName(meta.id, n)}
                      onOpacityChange={(v) => setLayerOpacity(meta.id, v)}
                    />
                  )
                }
                return (
                  <SortableLayerRow
                    key={meta.id}
                    id={meta.id}
                    name={meta.name}
                    depth={meta.depth}
                    visible={meta.visible}
                    opacity={meta.opacity}
                    blendMode={meta.blendMode}
                    layerType={meta.type}
                    isActive={meta.id === activeLayerId}
                    isSelected={selectedLayerIds.includes(meta.id)}
                    isReference={meta.id === referenceLayerId}
                    activeDragId={activeDragId}
                    overDropId={overDropId}
                    selectionMode={selectionMode}
                    maskOverlayIds={meta.maskOverlayIds}
                    maskTargetIds={meta.maskTargetIds}
                    onSelect={(e) => onSelect(e, meta.id, selectionMode, selectLayer, selectRange, toggleLayerInSelection)}
                    onVisibilityToggle={() => setLayerVisibility(meta.id, !meta.visible)}
                    onOpacityChange={(v) => setLayerOpacity(meta.id, v)}
                    onBlendModeChange={(m) => setLayerBlendMode(meta.id, m)}
                    onRename={(n) => setLayerName(meta.id, n)}
                    onToggleReference={() => setReferenceLayerId(meta.id === referenceLayerId ? null : meta.id)}
                  />
                )
              })}

              {/* ROOT END — only active during drag. This is THE big "drop-out-
                  of-group" target. Sits at the bottom of the panel and grows
                  visually so it's impossible to miss. */}
              {activeDragId && activeDragInsideGroup && (
                <RootEndDropZone active={overDropId === ROOT_END} />
              )}
              {activeDragId && !activeDragInsideGroup && (
                <PanelDropZone
                  id={ROOT_END}
                  active={overDropId === ROOT_END}
                  hint="Move to end of root"
                />
              )}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeMeta ? (
              <div className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white/90 shadow-2xl ring-1 ring-white/20 backdrop-blur-xl">
                {activeMeta.type === 'group' ? <Folder size={12} className="inline mr-2 -mt-0.5" /> : null}
                {activeMeta.name}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}

// ─── Multi-select helper ──────────────────────────────────────────────────────

function onSelect(
  e: React.MouseEvent,
  id: string,
  selectionMode: boolean,
  selectLayer: (id: string, additive: boolean) => void,
  selectRange: (id: string) => void,
  toggleInSelection: (id: string) => void,
) {
  if (selectionMode) { toggleInSelection(id); return }
  if (e.shiftKey) { selectRange(id); return }
  selectLayer(id, e.metaKey || e.ctrlKey)
}

// ─── Per-row context menu hook ────────────────────────────────────────────────

function useLayerContextTrigger() {
  const [menu, setMenu] = React.useState<{ x: number; y: number } | null>(null)
  const longPressRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const open = (x: number, y: number) => setMenu({ x, y })
  const close = () => setMenu(null)
  const onContextMenu = (e: React.MouseEvent) => { e.preventDefault(); open(e.clientX, e.clientY) }
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    longPressRef.current = setTimeout(() => open(e.clientX, e.clientY), 500)
  }
  const cancelLongPress = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current)
  }
  return { menu, close, onContextMenu, onPointerDown, cancelLongPress }
}

// ─── Drop zones ───────────────────────────────────────────────────────────────

/**
 * Thin invisible droppable above/below each row, used to capture "drop before
 * this row" vs. "drop after this row" without ambiguity. Becomes a visible
 * blue line when armed (cursor inside).
 */
function RowDropZone({
  id, active, depth,
}: { id: DropTargetId; active: boolean; depth: number }) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className="relative h-1.5"
      style={{ marginLeft: depth * INDENT_PX }}
    >
      {active && (
        <div
          className="pointer-events-none absolute inset-x-2 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.7)]"
        >
          <span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full border-[3px] border-blue-400 bg-[#111]" />
        </div>
      )}
    </div>
  )
}

/**
 * Group "into" zone — the body of the group row acts as the drop target.
 * When armed, the group row pulses with a ring.
 */
function GroupIntoZone({
  id, active, children,
}: { id: DropTargetId; active: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={active ? 'ring-2 ring-blue-400/80 bg-blue-500/8 rounded-xl' : ''}>
      {children}
    </div>
  )
}

/** Generic panel-level drop zone (root::start/root::end). */
function PanelDropZone({
  id, active, hint,
}: { id: DropTargetId; active: boolean; hint: string }) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={[
        'relative my-0.5 rounded-lg border border-dashed transition-colors',
        active ? 'border-blue-400/80 bg-blue-500/10' : 'border-white/15 bg-white/2',
      ].join(' ')}
      style={{ minHeight: 24 }}
    >
      <span
        className={[
          'pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-wider transition-opacity',
          active ? 'text-blue-200 opacity-100' : 'text-white/30 opacity-60',
        ].join(' ')}
      >
        {hint}
      </span>
    </div>
  )
}

/**
 * Special "move out of group" drop strip. Renders only while dragging a
 * layer that's INSIDE a group, pinned to the bottom of the panel. Big and
 * highly visible — there's no way to miss it.
 */
function RootEndDropZone({ active }: { active: boolean }) {
  const { setNodeRef } = useDroppable({ id: ROOT_END })
  return (
    <div
      ref={setNodeRef}
      className={[
        'relative mt-2 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 transition-all',
        active
          ? 'border-amber-400/85 bg-amber-500/12 text-amber-200 scale-[1.02]'
          : 'border-amber-400/35 bg-amber-500/5 text-amber-200/65',
      ].join(' ')}
    >
      <FolderOpen size={14} />
      <span className="text-[11px] font-semibold uppercase tracking-wider">
        Drop here to move out of group
      </span>
    </div>
  )
}

// ─── Sortable layer/group rows ────────────────────────────────────────────────

function SortableLayerRow(props: LayerRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: props.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    marginLeft: props.depth * INDENT_PX,
    position: 'relative',
  }

  return (
    <>
      {/* Drop-before zone — only mounted during an active drag. */}
      {props.activeDragId && (
        <RowDropZone id={dropId('before', props.id)} active={props.overDropId === dropId('before', props.id)} depth={props.depth} />
      )}
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <LayerRow {...props} />
      </div>
      {props.activeDragId && (
        <RowDropZone id={dropId('after', props.id)} active={props.overDropId === dropId('after', props.id)} depth={props.depth} />
      )}
    </>
  )
}

function SortableGroupRow(props: GroupRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: props.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    marginLeft: props.depth * INDENT_PX,
    position: 'relative',
  }

  // The group's "into" zone wraps the entire row body (not the drop-before/
  // after slivers around it). This way dropping somewhere on the group row
  // itself = into the group; dropping in the thin slivers above/below =
  // sibling positioning.
  return (
    <>
      {props.activeDragId && (
        <RowDropZone id={dropId('before', props.id)} active={props.overDropId === dropId('before', props.id)} depth={props.depth} />
      )}
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <GroupIntoZone
          id={intoId(props.id)}
          active={props.overDropId === intoId(props.id)}
        >
          <GroupRow {...props} />
        </GroupIntoZone>
      </div>
      {props.activeDragId && (
        <RowDropZone id={dropId('after', props.id)} active={props.overDropId === dropId('after', props.id)} depth={props.depth} />
      )}
    </>
  )
}

// ─── Reverse sibling order for visual display (top-most layer at top) ─────────

function reverseSiblings(flat: ReturnType<typeof useFreeformStore.getState>['layers']) {
  const byParent = new Map<string | null, typeof flat>()
  for (const l of flat) {
    const arr = byParent.get(l.parentId) ?? ([] as typeof flat)
    arr.push(l)
    byParent.set(l.parentId, arr)
  }
  const out: typeof flat = []
  const walk = (parentId: string | null) => {
    const children = byParent.get(parentId) ?? []
    const reversed = [...children].reverse()
    for (const c of reversed) {
      out.push(c)
      if (c.type === 'group' && !c.collapsed) walk(c.id)
    }
  }
  walk(null)
  return out
}

// ─── Background layer row ──────────────────────────────────────────────────────

function BackgroundLayerRow({
  color, visible, isActive,
  onSelect, onVisibilityToggle, onColorChange,
}: {
  color: string; visible: boolean; isActive: boolean
  onSelect: () => void; onVisibilityToggle: () => void; onColorChange: (hex: string) => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showPicker) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  return (
    <div
      className={[
        'group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors cursor-pointer',
        isActive ? 'bg-white/8 ring-1 ring-white/20' : 'hover:bg-white/4',
      ].join(' ')}
      onClick={onSelect}
    >
      <button
        title="Change background color"
        onClick={(e) => { e.stopPropagation(); setShowPicker((p) => !p) }}
        className="h-5 w-5 shrink-0 rounded-md border border-white/20 shadow-inner transition hover:scale-110"
        style={{ backgroundColor: color }}
      />

      <span className="flex-1 text-sm font-medium text-white/70">Background</span>
      <span className="text-[9px] uppercase tracking-wider text-white/20 font-semibold">BG</span>

      <button
        onClick={(e) => { e.stopPropagation(); onVisibilityToggle() }}
        className="text-white/30 hover:text-white/80 transition p-0.5"
        title={visible ? 'Hide' : 'Show'}
      >
        {visible ? <Eye size={14} /> : <EyeOff size={14} className="text-white/20" />}
      </button>

      {showPicker && (
        <PickerPopup
          ref={pickerRef}
          color={color}
          onChange={onColorChange}
        />
      )}
    </div>
  )
}

// ─── Regular layer row ────────────────────────────────────────────────────────

interface LayerRowProps {
  id: string; name: string; depth: number
  visible: boolean; opacity: number; blendMode: string; layerType: 'raster' | 'vector'
  isActive: boolean; isSelected: boolean; isReference: boolean
  /** Active dnd-kit drag id, or null when nothing is dragging. */
  activeDragId: string | null
  /** Active drop target id (matches the `id` prop on the over droppable). */
  overDropId: DropTargetId | null
  selectionMode: boolean
  maskOverlayIds: string[]
  maskTargetIds: string[]
  onSelect: (e: React.MouseEvent) => void
  onVisibilityToggle: () => void
  onToggleReference: () => void
  onOpacityChange: (v: number) => void
  onBlendModeChange: (m: string) => void
  onRename: (n: string) => void
}

function LayerRow(props: LayerRowProps) {
  const {
    id, name, visible, opacity, blendMode, layerType,
    isActive, isSelected, isReference,
    selectionMode, maskOverlayIds, maskTargetIds,
    onSelect, onVisibilityToggle,
    onOpacityChange, onBlendModeChange, onRename, onToggleReference,
  } = props
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { menu, close, onContextMenu, onPointerDown, cancelLongPress } = useLayerContextTrigger()

  const commitRename = () => {
    setEditing(false)
    if (draft.trim()) onRename(draft.trim())
    else setDraft(name)
  }

  useEffect(() => {
    if (editing) { setDraft(name); inputRef.current?.focus(); inputRef.current?.select() }
  }, [editing, name])

  const isClipped = maskOverlayIds.length > 0
  const isBaseForOthers = maskTargetIds.length > 0

  return (
    <>
      <div
        className={[
          'group rounded-xl transition-colors overflow-hidden',
          isActive ? 'bg-white/8 ring-1 ring-white/20'
            : isSelected ? 'bg-white/5 ring-1 ring-white/10'
            : 'hover:bg-white/4',
          isReference ? 'ring-1 ring-amber-400/40' : '',
        ].join(' ')}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
      >
        <div className="flex items-center gap-1.5 px-2 py-2.5 cursor-pointer" onClick={onSelect}>
          {selectionMode && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onSelect(e) }}
              className={[
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                isSelected
                  ? 'border-blue-400/80 bg-blue-500/30 text-white'
                  : 'border-white/20 bg-white/5 text-transparent hover:border-white/40',
              ].join(' ')}
              aria-label={isSelected ? 'Deselect' : 'Select'}
            >
              {isSelected ? <Check size={12} /> : null}
            </button>
          )}

          <span className={[
            'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
            layerType === 'vector' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/15 text-blue-400/80',
          ].join(' ')}>
            {layerType === 'vector' ? 'VEC' : 'PX'}
          </span>

          {isClipped && (
            <span title="Clipping mask — this layer only shows where the base below has alpha"
                  className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold bg-sky-500/20 text-sky-300">
              <Scissors size={9} />CLIP
            </span>
          )}
          {isBaseForOthers && !isClipped && (
            <span title="Base layer — its alpha clips the layer(s) above"
                  className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold bg-emerald-500/20 text-emerald-300">
              BASE
            </span>
          )}

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
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 rounded-lg bg-white/10 px-2 py-0.5 text-xs text-white outline-none"
            />
          ) : (
            <span
              className="flex-1 text-sm text-white/80 truncate font-medium"
              onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
            >
              {name}
            </span>
          )}

          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={onToggleReference}
              title={isReference ? 'Remove reference' : 'Set as reference layer'}
              className={[
                'p-0.5 transition',
                isReference
                  ? 'text-amber-400 opacity-100'
                  : 'opacity-0 group-hover:opacity-100 text-white/25 hover:text-amber-400',
              ].join(' ')}
            >
              <Bookmark size={13} />
            </button>
            <button onClick={onVisibilityToggle} className="text-white/30 hover:text-white/80 transition p-0.5">
              {visible ? <Eye size={14} /> : <EyeOff size={14} className="text-white/20" />}
            </button>
            {isActive && (
              <button onClick={() => setExpanded((x) => !x)} className="text-white/25 hover:text-white/60 transition p-0.5">
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            )}
          </div>
        </div>

        {isActive && expanded && (
          <div className="flex flex-col gap-2.5 px-3 pb-3 pt-1 border-t border-white/6 row-expand" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <DraggableInput
                label="Opacity"
                value={Math.round(opacity * 100)}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => onOpacityChange(v / 100)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/35 w-14 shrink-0">Blend</span>
              <select
                value={blendMode}
                onChange={(e) => onBlendModeChange(e.target.value)}
                className="flex-1 rounded-lg bg-white/6 border border-white/8 px-2 py-1 text-[11px] text-white/55 outline-none"
              >
                {BLEND_MODES.map((m) => <option key={m} value={m} className="bg-zinc-900">{m}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {menu && <LayerContextMenu x={menu.x} y={menu.y} onClose={close} focusedId={id} />}
    </>
  )
}

// ─── Group row ────────────────────────────────────────────────────────────────

interface GroupRowProps {
  id: string; name: string; depth: number
  visible: boolean; opacity: number; collapsed: boolean; childCount: number
  isActive: boolean; isSelected: boolean
  activeDragId: string | null
  overDropId: DropTargetId | null
  selectionMode: boolean
  isReference: boolean
  maskOverlayIds: string[]
  maskTargetIds: string[]
  onSelect: (e: React.MouseEvent) => void
  onToggleCollapsed: () => void
  onVisibilityToggle: () => void
  onRename: (n: string) => void
  onOpacityChange: (v: number) => void
}

function GroupRow(props: GroupRowProps) {
  const {
    id, name, visible, opacity, collapsed, childCount,
    isActive, isSelected, selectionMode,
    isReference, maskOverlayIds, maskTargetIds,
    onSelect, onToggleCollapsed, onVisibilityToggle, onRename, onOpacityChange,
  } = props
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)
  const { menu, close, onContextMenu, onPointerDown, cancelLongPress } = useLayerContextTrigger()

  const commitRename = () => {
    setEditing(false)
    if (draft.trim()) onRename(draft.trim())
    else setDraft(name)
  }

  useEffect(() => {
    if (editing) { setDraft(name); inputRef.current?.focus(); inputRef.current?.select() }
  }, [editing, name])

  const isClipped = maskOverlayIds.length > 0
  const isBaseForOthers = maskTargetIds.length > 0

  return (
    <>
      <div
        className={[
          'group rounded-xl transition-all overflow-hidden',
          isActive ? 'bg-amber-500/10 ring-1 ring-amber-400/30'
            : isSelected ? 'bg-white/5 ring-1 ring-white/10'
            : 'hover:bg-white/4',
          isReference ? 'ring-1 ring-amber-400/40' : '',
        ].join(' ')}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
      >
        <div className="flex items-center gap-1.5 px-2 py-2.5 cursor-pointer" onClick={onSelect}>
          {selectionMode && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onSelect(e) }}
              className={[
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                isSelected
                  ? 'border-blue-400/80 bg-blue-500/30 text-white'
                  : 'border-white/20 bg-white/5 text-transparent hover:border-white/40',
              ].join(' ')}
              aria-label={isSelected ? 'Deselect' : 'Select'}
            >
              {isSelected ? <Check size={12} /> : null}
            </button>
          )}

          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggleCollapsed() }}
            className="text-white/45 hover:text-white/80 transition p-0.5"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>

          {collapsed ? <Folder size={13} className="text-amber-400/80" /> : <FolderOpen size={13} className="text-amber-400/90" />}

          {isClipped && (
            <span title="This group is clipped to the base layer below it"
                  className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold bg-sky-500/20 text-sky-300">
              <Scissors size={9} />CLIP
            </span>
          )}
          {isBaseForOthers && !isClipped && (
            <span title="This group is the base — its alpha clips the layer(s) above"
                  className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold bg-emerald-500/20 text-emerald-300">
              BASE
            </span>
          )}

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
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 rounded-lg bg-white/10 px-2 py-0.5 text-xs text-white outline-none"
            />
          ) : (
            <span
              className="flex-1 text-sm text-white/85 truncate font-medium"
              onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
            >
              {name}
            </span>
          )}

          <span className="shrink-0 rounded bg-white/8 px-1.5 py-0.5 text-[9px] font-mono text-white/45">{childCount}</span>

          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button onClick={onVisibilityToggle} className="text-white/30 hover:text-white/80 transition p-0.5">
              {visible ? <Eye size={14} /> : <EyeOff size={14} className="text-white/20" />}
            </button>
          </div>
        </div>

        {isActive && (
          <div className="flex items-center gap-2 px-3 pb-2.5 pt-0.5 border-t border-white/6 row-expand" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <DraggableInput
              label="Opacity"
              value={Math.round(opacity * 100)}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => onOpacityChange(v / 100)}
            />
          </div>
        )}
      </div>

      {menu && <LayerContextMenu x={menu.x} y={menu.y} onClose={close} focusedId={id} />}
    </>
  )
}

// ─── Panel-scoped animations ──────────────────────────────────────────────────

function PanelStyles() {
  return (
    <style>{`
      .layer-panel-enter {
        animation: layerPanelIn 200ms cubic-bezier(0.22, 1, 0.36, 1);
        transform-origin: top right;
      }
      @keyframes layerPanelIn {
        from { opacity: 0; transform: translateX(8px) scale(0.98); }
        to   { opacity: 1; transform: translateX(0) scale(1); }
      }
      .row-expand {
        animation: rowExpandIn 180ms ease;
      }
      @keyframes rowExpandIn {
        from { opacity: 0; max-height: 0; }
        to   { opacity: 1; max-height: 200px; }
      }
    `}</style>
  )
}

// ─── Color picker popup ──────────────────────────────────────────────────────

const PickerPopup = forwardRef<HTMLDivElement, {
  color: string
  onChange: (hex: string) => void
}>(function PickerPopup({ color, onChange }, ref) {
  if (typeof document === 'undefined') return null

  const panel = document.querySelector('[data-layer-panel]') as HTMLElement | null
  const PICKER_H = 292
  const PICKER_W = 260
  let left = window.innerWidth - PICKER_W - 16
  let top = 0

  if (panel) {
    const rect = panel.getBoundingClientRect()
    left = rect.left
    const spaceBelow = window.innerHeight - rect.bottom
    top = spaceBelow >= PICKER_H + 8 ? rect.bottom + 4 : rect.top - PICKER_H - 4
  }

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] rounded-2xl border border-white/10 bg-[#1a1a1a]/95 p-3 shadow-2xl backdrop-blur-xl"
      style={{ left, top, width: PICKER_W }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Background Color</p>
      <HexColorPicker color={color} onChange={onChange} style={{ width: '100%' }} />
      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-7 flex-1 rounded-lg border border-white/10" style={{ backgroundColor: color }} />
        <span className="font-mono text-xs text-white/40">{color.toUpperCase()}</span>
      </div>
    </div>,
    document.body,
  )
})
