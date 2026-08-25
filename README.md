# PixelVerse 🎮

A browser-based pixel art creation platform with multi-frame animation support, an image-to-pixel converter, and a full animation studio — built entirely with vanilla HTML, CSS, and JavaScript. No frameworks, no build step, just open and draw.

## 🌐 Live Demo

- **Railway:** https://pixelverse.up.railway.app
- **Netlify:** https://piixelverse.netlify.app


---

## ✨ Features

### 🖌️ Pixel Editor
- **Drawing tools:** Pencil, Eraser, Flood Fill, and Color Picker
- **Bresenham line interpolation** — smooth, unbroken strokes even during fast mouse movements
- **Configurable grid sizes:** 16×16, 32×32, 64×64, and 128×128
- **16-color default palette** with custom color support and a recent-colors tray
- **Undo / Redo** with a per-frame history stack
- **Grid line toggle** for cleaner previews

### 🎞️ Multi-Frame Animation
- Add, delete, duplicate, and reorder frames via a drag-and-drop timeline
- **Onion skinning** — ghost up to 3 previous frames behind the active one, with geometric opacity falloff so frame order stays readable
- Configurable FPS (8, 12, 16, 24, 30)
- Loop toggle

### 🎬 Animation Studio
- Dedicated studio view for arranging and previewing full animations
- Live playback with transport controls (Play/Pause/Step)
- Edit individual frames directly inside the studio canvas
- Separate save/export flow for multi-frame output

### 🖼️ Image → Pixel Art Converter
- Import any image file and convert it to a pixel-art grid automatically
- Uses native browser area-averaging (no hand-written box filter) for a proper downsample
- Palette reduction via **median-cut quantization** — picks the most representative colors from the source image
- Adjustable grid size and palette size before conversion
- Converts to a reference layer or directly starts a new project

### 📐 Reference Layer & Comparison
- Load a reference image alongside your canvas in a side-by-side panel, or ghost it as an underlay beneath your drawing
- Adjustable underlay opacity (0–100%) and zoom (1–4×)
- **Perceptual similarity scoring** — compares your canvas cell-by-cell against the reference using redmean color distance
  - Exact match, close match (within configurable tolerance), missing paint, and extra paint are each classified separately
  - Accuracy displayed as a percentage; error cells highlighted directly on the canvas

### 💾 Save & Export
| Format | Description |
|---|---|
| PNG | Single frame, transparent background |
| JPEG | Single frame with white background |
| BMP | Single frame, 24-bit uncompressed |
| GIF | Animated, transparent support |
| WebP | Animated, high quality |
| MP4 | Video stream |
| Sprite Sheet | All frames as a PNG grid strip |
| JSON | Full project backup including replay journal |

All saves target **LocalStorage** with graceful quota degradation: frames are preserved even if the replay journal has to be dropped.

### ⏪ Replay
- Every brush stroke is recorded in an **append-only delta journal** (separate from the undo stack)
- Replay reconstructs the canvas from deltas — no intermediate snapshots stored
- Forward playback is O(1) per frame via a cursor; seeking backward replays from the start
- Journal entries carry `frameId`, `seq`, and relative timestamp — designed to extend to a server-side event-sourcing model without rewriting

### 💾 Autosave & Session Restore
- Autosave runs on a schedule and writes to a dedicated LocalStorage slot
- On next open, a restore bar appears offering to continue the unsaved session
- Three save slots: blank canvas, image project, and a default project slot

---

## 🗂️ Project Structure

```
pixelverse_tablet/
├── index.html              # Landing page (marketing, feature showcase)
├── blank.html              # Blank canvas entry point → Editor + Studio views
├── image.html              # Image-to-pixel-art converter entry point
├── style.css               # Landing page styles
│
├── css/
│   ├── base.css            # Design tokens, CSS variables, typography
│   ├── components.css      # Shared UI components
│   ├── tablet.css          # Tablet/responsive layout overrides
│   └── views/
│       ├── editor.css      # Pixel editor layout
│       ├── studio.css      # Animation studio layout
│       ├── landing.css     # Landing page view styles
│       └── reference.css   # Reference panel styles
│   └── components/
│       ├── forgeLoader.css # Transition animation
│       ├── replay.css      # Replay overlay
│       └── save.css        # Save/export modal
│
└── js/
    ├── main.js             # Landing page entry point
    ├── blank.js            # Canvas app entry point
    ├── image.js            # Image converter entry point
    ├── script.js           # Landing page animations (GSAP, pixel sprites)
    │
    ├── core/
    │   ├── state.js        # Global state (single source of truth)
    │   ├── router.js       # Minimal SPA view router (no page loads)
    │   ├── project.js      # Save / load / autosave / serialise / deserialise
    │   ├── codec.js        # RLE + palette-index grid encoder/decoder
    │   ├── journal.js      # Append-only delta journal for replay
    │   └── storage.js      # LocalStorage wrapper
    │
    ├── canvas/
    │   ├── renderer.js     # Canvas rendering (grid, onion, reference, errors)
    │   ├── tools.js        # Pencil, eraser, fill (flood), color picker
    │   ├── grid.js         # Grid creation, resizing, cell access
    │   ├── history.js      # Per-frame undo/redo stack
    │   ├── onionSkin.js    # Onion skin layer resolver
    │   ├── referenceLayer.js # Reference underlay logic
    │   └── selection.js    # Selection tool
    │
    ├── frames/
    │   ├── frameManager.js # Add, delete, duplicate, move, resize frames
    │   └── timeline.js     # Drag-and-drop timeline UI component
    │
    ├── animation/
    │   ├── player.js       # Frame-by-frame playback engine
    │   ├── export.js       # Export to PNG/JPEG/BMP/GIF/WebP/MP4/Sprite Sheet
    │   └── stats.js        # Animation stats (duration, frame count)
    │
    ├── image/
    │   ├── pixelate.js     # Image → pixel grid pipeline
    │   └── palette.js      # Median-cut quantization, color distance (redmean)
    │
    ├── compare/
    │   └── similarity.js   # Perceptual cell-by-cell similarity scoring
    │
    └── views/
        ├── editor.js       # Editor view controller (DOM wiring, pointer events)
        ├── studio.js       # Animation studio view controller
        ├── landing.js      # Landing page view controller
        ├── forgeLoader.js  # Animated forge-transition between views
        ├── replayOverlay.js # Replay scrubber overlay
        ├── reference.js    # Reference panel controller
        ├── saveModal.js    # Save / export modal
        └── autosaveModal.js # Session restore modal
```

---

## 🚀 Getting Started

No build tools or package installation required.

**Option 1 — Open directly in the browser:**
```
open pixelverse_tablet/index.html
```

**Option 2 — Serve locally (recommended for ES module imports):**
```bash
# Python
python3 -m http.server 8080

# Node.js
npx serve pixelverse_tablet
```
Then visit `http://localhost:8080`.

**Entry points:**
- `index.html` — marketing landing page with feature overview
- `blank.html` — jump straight into the pixel editor
- `image.html` — convert a photo to pixel art

---

## 🎨 Design System

PixelVerse uses a custom CSS variable system defined in `css/base.css`:

| Token | Value | Role |
|---|---|---|
| `--pv-sky` | `#111625` | Background dark |
| `--pv-stone-dk` | `#1c282e` | Panel background |
| `--pv-sun` | `#e88d30` | Primary CTA / Pencil |
| `--pv-magenta` | `#d92bb4` | Studio / Pro accent |
| `--pv-moss` | `#4a6b46` | Success / Lime |
| `--pv-text` | `#eef1f5` | Body text |

**Fonts:**
- `Press Start 2P` — pixel display / HUD labels
- `Space Grotesk` — headings
- `Fira Sans` — body text

**Icons:** [Tabler Icons](https://tabler.io/icons) webfont

---

## 🧠 Architecture Notes

**State management** — a single `state.js` object is the source of truth. Views read from it; nothing keeps a local copy. The canvas always edits `frames[activeFrame].grid` — `currentFrame()` and `currentGrid()` are the only safe accessors.

**Codec** — grids are RLE + palette-index encoded before hitting LocalStorage. A raw 64×64 grid at 200 frames would exceed the 5 MB LocalStorage cap; encoding keeps it well under.

**Journal vs History** — two separate structures on purpose. `History` (undo stack) is mutable and pops on undo. `Journal` (delta log) is append-only and never pops — it records what actually happened, including undone strokes, so the replay is a true playback of the session.

**Router** — a minimal SPA router that toggles `.is-active` on `<section class="view">` elements. No page loads, so in-memory state (frames, history, journal) survives navigation between the editor and the studio.

**Onion skin** — previous frames are *drawn*, never *merged*. `onionSkin.js` only reports which grids to ghost and at what opacity; it never writes to a grid.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 |
| Styling | CSS custom properties + Tailwind CSS v4 (CDN, browser runtime) |
| Logic | Vanilla ES Modules (no bundler) |
| Animations | GSAP + ScrollTrigger (landing page) |
| Scroll | Locomotive Scroll v5 |
| Storage | LocalStorage |
| Exports | Canvas API + native browser encoders |

---

## 📱 Responsive / Tablet Support

The `css/tablet.css` layer applies layout overrides for tablet viewports. The editor and studio are designed with touch pointer events in mind alongside mouse input.

---

## 📄 License

This project is open for personal and educational use.
