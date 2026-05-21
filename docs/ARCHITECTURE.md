# @sketchboard Architecture

## Core Design Philosophy

**Headless core, opinionated templates.** `@sketchboard/core` contains zero UI, zero framework dependency. It is a rendering engine and data model. Everything visual lives in `apps/demo/src/templates/` and can be replaced freely.

---

## Coordinate System

All public API coordinates are **logical CSS pixels** (not physical/DPR-scaled).

```
Physical pixels = logical × devicePixelRatio
Board.logicalWidth  ← always use this for coordinate math
Board.canvas.width  ← only for raw canvas ops (getImageData etc.)
```

`Canvas2DRenderer` scales the context by `dpr` before applying the camera, so all layer rendering runs in logical-pixel space. Brush stamps land at world-space coordinates on the offscreen layer canvas.

---

## Rendering Pipeline

```
RAF loop → Board.render()
  → Canvas2DRenderer.render(layers, camera)
      → ctx.scale(dpr, dpr)                      ← enter logical pixel space
      → camera.applyToContext(ctx, logW, logH)   ← pan/zoom/rotate
      → for each Layer (bottom → top):
          layer.render(ctx, camera)               ← each draws in world space
```

Each `RasterLayer` holds its own offscreen `HTMLCanvasElement`. Only dirty frames trigger re-render (`Board.markDirty()`).

### Future: Node-Based Pipeline

Layers composited bottom-to-top today. The roadmap adds a **NodeGraph** compositor:

```
[RasterLayer] ──→ [ColorCorrectNode] ──→ [MergeNode] ──→ [OutputNode]
[RasterLayer] ──╯
```

Non-destructive effects, masking nodes, and conditional compositing without changing the `Layer` API.

---

## Camera Model

```
camera.position  = world-space point shown at logical viewport center
camera.zoom      = logical pixels per world unit  (1.0 = 1:1)
camera.rotation  = radians
```

`camera.applyToContext(ctx, logW, logH)`:
1. `translate(logW/2, logH/2)` — origin to screen center
2. `rotate(rotation)`
3. `scale(zoom, zoom)`
4. `translate(-pos.x, -pos.y)` — offset by camera position

Coordinate conversion:
```typescript
const world = camera.screenToWorld(pointer.x, pointer.y, board.logicalWidth, board.logicalHeight)
const canvasX = world.x - layer.transform.x   // layer-local pixel
```

---

## Tool System

```
GestureManager (pointer/wheel/spacebar) → board.activeTool?.onPointerDown/Move/Up()
```

`BrushTool` flow:
1. Convert pointer coords → world coords (via `camera.screenToWorld`)
2. Subtract layer transform → layer canvas coords
3. Draw radial gradient stamps along the stroke path
4. On stroke complete: snapshot `ImageData` before/after and push to `HistoryManager`

**Temp tool override (Space-to-pan)**: `board.setTempTool('pan')` — `board.activeTool` returns the temp tool transparently. `clearTempTool()` restores the real tool without firing `hooks.toolChanged`.

---

## Plugin System

```typescript
class MyPlugin implements Plugin {
  readonly name = 'my-plugin'
  onInstall(board: Board): void { /* tap hooks, register tools */ }
  onUninstall?(board: Board): void { /* cleanup */ }
}
board.use(new MyPlugin())
```

Key hooks:
- `hooks.beforeRender` / `hooks.afterRender` — every frame
- `hooks.colorPicked` — fired by EyedropperTool
- `hooks.toolChanged` — fired when `setActiveTool` is called
- `hooks.layerAdded` / `hooks.layerRemoved`

⚠️ **Never call `board.setActiveTool(name)` inside a `toolChanged` listener.** This creates an infinite loop. Use `zustandStore.setState({ activeToolId })` directly.

---

## Keyboard System

`KeyboardPlugin` installs a `KeyboardManager` with default shortcuts for all tools + undo/redo/size. Override or extend:
```typescript
board.use(new KeyboardPlugin({
  brush: null,   // disable default B shortcut
  fill: { key: 'f', cmdOrCtrl: false, description: 'Fill', handler: (b) => myFill(b) },
}))
```

---

## History

Each stroke commit stores `ImageData` snapshots (before/after) for the affected layer. Configure depth:
```typescript
new Board(container, { historySize: 128 })  // default: 64
```

Future optimization: incremental tile diffs to reduce memory 10–100×.

---

## DPR / High-DPI

```
ResizeObserver → board._logicalWidth/Height = CSS px
              → canvas.width/height = CSS px × dpr
Canvas2DRenderer → ctx.scale(dpr, dpr) → camera uses logical dimensions
BrushTool → camera.screenToWorld(e.x, e.y, board.logicalWidth, board.logicalHeight)
```

---

## Templates (`apps/demo/src/templates/`)

Each template is a standalone React module:
```
<name>/
├── FreeformTemplate.tsx   ← orchestrator
├── store.ts               ← Zustand (UI state ↔ Board sync)
├── types.ts               ← tool IDs, backgrounds
└── components/            ← toolbar, panels, cursor, etc.
```

Template pattern: **UI events → store actions → board methods → hook events → `zustand.setState()`**

The core never imports from templates. Templates import from core.

---

## Package Boundaries

```
@sketchboard/core        ← zero external deps; Browser APIs ok
@sketchboard/animation   ← depends on core only
@sketchboard/react       ← depends on core; react is a peerDep
apps/demo                ← depends on core + react; uses Tailwind, Zustand, etc.
```

---

## Masking & Alpha Lock (Foundation)

`RasterLayer.alphaLock` (to be added): when `true`, BrushTool uses `source-atop` composite op — paints only where alpha > 0 already. Foundation exists in the architecture; not yet exposed in the template UI.

Clipping masks and layer masks require the future NodeGraph compositor.
