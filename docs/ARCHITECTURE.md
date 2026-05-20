# Architecture Deep-Dive

## Rendering Pipeline

```
Board.startRenderLoop()
  └─▶ requestAnimationFrame (loop)
        ├── if dirty:
        │     ├── hooks.beforeRender.call(board)   ← plugins may update layer state here
        │     ├── Canvas2DRenderer.render(layers, camera)
        │     │     ├── ctx.clearRect(...)
        │     │     ├── ctx.save()
        │     │     ├── camera.applyToContext(ctx, w, h)
        │     │     ├── for each visible layer: layer.render(ctx, camera)
        │     │     └── ctx.restore()
        │     ├── hooks.afterRender.call(board)
        │     └── dirty = false
        └── next frame
```

## Camera & Coordinate Systems

- **World space**: The abstract coordinate system that layers live in. A `RasterLayer(1920, 1080)`
  occupies world coordinates (0,0) → (1920, 1080).
- **Screen space**: CSS logical pixels on the canvas element.
- **Physical pixels**: CSS pixels × `devicePixelRatio`. The HTMLCanvasElement `.width` is in physical pixels.

The Camera maps world → screen with: `screen = (world - camera.position) × zoom + canvasCenter`.

The Board sizes the canvas in physical pixels but exposes logical CSS dimensions to Camera.

## Layer System

Every layer has an independent offscreen `HTMLCanvasElement`. The compositor (Canvas2DRenderer) calls
`layer.render(ctx, camera)` which draws the layer's canvas into the compositing context at the layer's
transform position.

**Blending** uses the standard CSS composite operations (`ctx.globalCompositeOperation`). Each layer
specifies its own blend mode.

## Tool System & Input

`GestureManager` attaches to the main canvas and dispatches events:
- **1 active pointer**: forwarded to `board.activeTool` as `PointerData`
- **2 active pointers**: interpreted as pinch-zoom + two-finger pan by `GestureManager` directly

`PointerData` always contains **screen-space** coordinates. Tools that draw to a `RasterLayer` must
convert to world space via `board.camera.screenToWorld(x, y, canvasW, canvasH)`.

## History / Undo-Redo

Stroke-level history: when `BrushTool.onPointerDown` fires, it captures a full `ImageData` snapshot of
the active layer. On `onPointerUp`, it pushes a `HistoryEntry` with before/after snapshots.

This is simple and correct but memory-heavy for large canvases. Future optimization: tile-based diff
(only snapshot dirty tiles).

## Plugin Hooks

```typescript
// BoardHooks exposes these typed hooks:
board.hooks.beforeRender      // fires every frame before compositing
board.hooks.afterRender       // fires every frame after compositing
board.hooks.layerAdded        // fires when a layer is added
board.hooks.layerRemoved      // fires when a layer is removed
board.hooks.toolChanged       // fires when active tool changes
board.hooks.activeLayerChanged
board.hooks.destroy           // fires when board.destroy() is called
```

Plugins use `hook.tap('plugin-name', handler)` which returns an unsubscribe function.

## Animation Plugin

`AnimationPlugin` installs a `Timeline` that drives layer and camera properties:

```
Timeline
├── tracks: Map<"layerId.property", KeyframeTrack>
├── currentTime: number (seconds)
├── duration, fps, loop
└── tick() via requestAnimationFrame
      └── evaluates all tracks → applyValue(targetId, property, value)
            ├── layer.transform.x / y / rotation / scaleX / scaleY / zDepth
            ├── layer.opacity
            └── camera.zoom / rotation / position.x / position.y
                 (targetId '__camera__' is reserved for the camera)
```

Keyframe interpolation: linear lerp with pluggable easing function per keyframe.

## Future: Frame-by-Frame Layer

A `FrameLayer` will extend `RasterLayer` with:
- `frames: HTMLCanvasElement[]` — one canvas per frame
- `currentFrameIndex: number` — driven by the Timeline
- The Timeline will animate `'__frame__'` property on the layer to trigger frame switches

## Future: Vector Layer

A `VectorLayer` will store `Path2D` objects + stroke/fill styles. It renders via `ctx.stroke(path)`.
Vectors scale perfectly with camera zoom (no pixelation). SVG import/export via `DOMParser`.

## Future: Composition Layer

A `CompositionLayer` wraps another `Board` instance. On `render()`, it calls the nested board's
renderer into an offscreen canvas, then composites that into the parent canvas at the layer's transform.
This enables nested animations with independent timelines.
