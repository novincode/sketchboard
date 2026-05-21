# @sketchboard/core

Framework-agnostic infinite canvas drawing engine for the web.

## Install

```bash
pnpm add @sketchboard/core
```

## Quick start

```typescript
import { Board, RasterLayer, BrushTool, EraserTool, KeyboardPlugin } from '@sketchboard/core'

const board = new Board(document.getElementById('canvas-container')!, {
  background: 'transparent',
  historySize: 64,  // undo steps
})

// Create a drawing layer (world-pixel dimensions)
const layer = new RasterLayer(1920, 1080, 'My Layer')
layer.backgroundColor = '#ffffff'  // white artboard
board.addLayer(layer)
board.setActiveLayer(layer.id)

// Register and activate tools
board.registerTool('brush', new BrushTool())
board.registerTool('eraser', new EraserTool())
board.setActiveTool('brush')

// Keyboard shortcuts (⌘Z undo, B brush, E eraser, etc.)
board.use(new KeyboardPlugin())

// Center camera on the layer
board.camera.position.x = 960
board.camera.position.y = 540

// Clean up
board.destroy()
```

## Board options

```typescript
new Board(container, {
  background: '#f0f0f0',  // canvas background color (default: transparent)
  pixelRatio: 2,          // override devicePixelRatio
  historySize: 128,       // max undo steps (default: 64)
})
```

## Tools

| Class | Shortcut | Description |
|-------|----------|-------------|
| `BrushTool` | B | Soft-edge pressure brush |
| `PenTool` | P | Hard-edge pen |
| `PencilTool` | N | Textured pencil with jitter |
| `EraserTool` | E | Erase pixels |
| `PanTool` | H | Pan the viewport |
| `EyedropperTool` | I | Sample color, fires `hooks.colorPicked` |

All tools can be configured:
```typescript
const brush = new BrushTool()
brush.settings.size = 20
brush.settings.opacity = 0.8
brush.settings.hardness = 0.7
brush.settings.pressureAffectsSize = true
brush.settings.pressureAffectsOpacity = false
brush.settings.color = Color.fromHex('#e74c3c')
board.registerTool('brush', brush)
```

## Custom keyboard shortcuts

```typescript
import { KeyboardPlugin } from '@sketchboard/core'

board.use(new KeyboardPlugin({
  brush: null,  // disable default B shortcut
  fill: {
    key: 'f',
    description: 'Fill layer',
    handler: (board) => fillActiveLayer(board),
  },
}))
```

## Plugins

```typescript
import type { Board, Plugin } from '@sketchboard/core'

class MyPlugin implements Plugin {
  readonly name = 'my-plugin'

  onInstall(board: Board): void {
    board.hooks.afterRender.tap('my-plugin', (b) => {
      // runs every rendered frame
    })
    board.hooks.colorPicked.tap('my-plugin', ({ color }) => {
      console.log('picked color:', color.toHex())
    })
  }

  onUninstall(board: Board): void {}
}

board.use(new MyPlugin())
```

## Layer management

```typescript
const layer = new RasterLayer(1920, 1080, 'Sketch')
board.addLayer(layer)
board.setActiveLayer(layer.id)

// Per-layer settings
layer.visible = false
layer.opacity = 0.5
layer.blendMode = 'multiply'

// Export layer as data URL
const png = layer.canvas.toDataURL('image/png')
```

## Coordinate system

All coordinates are in **logical CSS pixels**.

```typescript
// Convert screen pointer event → world position
const world = board.camera.screenToWorld(
  pointerEvent.x,
  pointerEvent.y,
  board.logicalWidth,
  board.logicalHeight,
)
```

## License

MIT
