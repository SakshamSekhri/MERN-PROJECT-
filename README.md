# PixelVerse 🎮

A browser-based pixel art creation platform built with HTML, CSS, and vanilla JavaScript. PixelVerse lets users draw pixel art, create multi-frame animations, convert images into pixel art, compare artwork against a reference, replay drawing sessions, and export their work in multiple formats.

## 🌐 Live Demo

- **Railway:** https://pixelverse.up.railway.app
- **Netlify:** https://piixelverse.netlify.app

---

## ✨ Features

### 🖌️ Pixel Editor

- Pencil, Eraser, Flood Fill, Color Picker, Line, and Selection tools
- Bresenham-style line interpolation for continuous strokes
- Configurable grid sizes including 16×16, 32×32, 64×64, and 128×128
- Default color palette with custom colors and recent colors
- Undo / Redo with per-frame history
- Grid visibility toggle
- Touch and pointer-event support for tablet interaction

### 🎞️ Multi-Frame Animation

- Add, delete, duplicate, move, and resize frames
- Drag-and-drop frame timeline
- Onion skinning for previous frames
- Configurable FPS: 8, 12, 16, 24, and 30
- Loop playback
- Frame-by-frame editing

### 🎬 Animation Studio

- Dedicated animation workspace
- Timeline-based frame management
- Play, pause, and step controls
- Edit frames directly on the studio canvas
- Animation statistics such as frame count and duration

### 🖼️ Image → Pixel Art Converter

- Import an image directly from the browser
- Convert an image into a configurable pixel grid
- Supports cover and contain fitting modes
- Browser Canvas API is used for image downsampling
- Palette reduction using a custom median-cut implementation
- Optional channel quantization
- Configurable palette size
- Generates a pixel-art grid and palette locally in the browser
- Can be used as a new project or reference

### 📐 Reference Layer & Similarity Comparison

- Load a reference image alongside the canvas
- Display the reference as a side-by-side image or an underlay
- Adjustable underlay opacity and zoom
- Convert the reference image to the current grid size
- Cell-by-cell comparison between the user's artwork and the reference
- Perceptual color comparison using a custom redmean color-distance calculation
- Classifies cells as:
  - Exact
  - Close
  - Wrong
  - Missing
  - Extra
  - Empty
- Displays placement, color, and overall similarity scores
- Highlights cells that need correction

### ⏪ Replay System

- Records drawing actions in an append-only delta journal
- Replay reconstructs the canvas from recorded changes
- Supports replay scheduling and seeking
- Keeps the replay journal separate from the undo/redo history

### 💾 Save, Autosave & Session Restore

- Project data is stored locally using browser LocalStorage
- Three project slots:
  - Default project
  - Blank project
  - Image project
- Autosave support
- Session restore prompt when an unsaved session is available
- Project serialization and deserialization
- RLE + palette-index encoding reduces project storage size

### 📤 Export

PixelVerse supports export functionality for:

- PNG
- JPEG
- BMP
- GIF
- Sprite Sheet
- WebP / browser-supported recording format
- MP4 / browser-supported video recording format

> WebP and MP4 export depend on browser `MediaRecorder` codec support. When a requested codec is unavailable, the implementation can fall back to a supported WebM codec.

---

## 🧠 Algorithms & Core Logic

PixelVerse does not depend on an external image-processing or AI API for its core features. Important processing is implemented directly in JavaScript.

### Image Pixelation

1. The selected image is loaded locally in the browser.
2. The Canvas API downsamples it to the selected grid size.
3. Pixel data is read using `getImageData()`.
4. Transparent pixels are handled separately.
5. The resulting colors can be reduced using the project's palette algorithms.

### Median-Cut Palette Reduction

The image converter includes a custom median-cut implementation that recursively divides RGB color samples into color boxes and selects representative colors.

### Color Quantization

An optional channel-quantization method reduces RGB channel precision before generating the palette.

### Perceptual Color Distance

PixelVerse uses a custom redmean-based RGB distance calculation rather than treating all RGB channels equally. This is used by the reference-comparison system.

### Similarity Scoring

The comparison system evaluates every grid cell and calculates:

- Placement score
- Color score
- Overall score
- Error-cell classifications

This allows the application to distinguish between missing paint, extra paint, wrong colors, close colors, and exact matches.

### Grid Encoding

Project grids are compressed using run-length encoding (RLE) combined with palette-index representation before being stored in LocalStorage.

---

## 🏗️ Architecture

PixelVerse is organized as a client-side modular JavaScript application.

### State Management

`js/core/state.js` maintains the main application state.

### Routing

`js/core/router.js` provides lightweight client-side view switching between the editor, studio, and landing views.

### Canvas System

The canvas modules handle:

- Rendering
- Grid creation and resizing
- Drawing tools
- Undo / Redo
- Selection
- Reference layers
- Onion skinning

### Frame System

The frame manager and timeline handle creation, deletion, duplication, movement, resizing, and ordering of animation frames.

### Storage System

The project/storage modules handle:

- Serialization
- Deserialization
- LocalStorage
- Autosave
- Session restoration
- Multiple project slots

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 |
| Styling | CSS3 + CSS custom properties |
| Logic | Vanilla JavaScript / ES Modules |
| Animations | GSAP + ScrollTrigger |
| Scroll | Locomotive Scroll v5 |
| Storage | LocalStorage |
| Exports | Canvas API + MediaRecorder API |

---

## 🔌 API Usage

PixelVerse does **not** use a custom backend API, REST API, GraphQL API, Firebase API, Supabase API, OpenAI API, or similar service for its core application functionality.

The main application runs client-side in the browser.

Browser APIs used by the project include:

- Canvas API
- LocalStorage API
- File / FileReader-related browser APIs
- Blob API
- URL Object URL API
- MediaRecorder API
- Pointer / mouse events
- Browser DOM APIs

External resources such as fonts, icons, and JavaScript libraries may be loaded from their respective CDNs.

---

## 📁 Project Structure

```text
pixelverse_tablet/
├── index.html
├── blank.html
├── image.html
├── style.css
├── script.js
│
├── css/
│   ├── base.css
│   ├── components.css
│   ├── tablet.css
│   ├── components/
│   │   ├── forgeLoader.css
│   │   ├── replay.css
│   │   └── save.css
│   └── views/
│       ├── editor.css
│       ├── studio.css
│       ├── landing.css
│       └── reference.css
│
└── js/
    ├── main.js
    ├── blank.js
    ├── image.js
    │
    ├── animation/
    │   ├── player.js
    │   ├── export.js
    │   └── stats.js
    │
    ├── canvas/
    │   ├── renderer.js
    │   ├── tools.js
    │   ├── grid.js
    │   ├── history.js
    │   ├── onionSkin.js
    │   ├── referenceLayer.js
    │   └── selection.js
    │
    ├── compare/
    │   └── similarity.js
    │
    ├── core/
    │   ├── state.js
    │   ├── router.js
    │   ├── project.js
    │   ├── codec.js
    │   ├── journal.js
    │   └── storage.js
    │
    ├── frames/
    │   ├── frameManager.js
    │   └── timeline.js
    │
    ├── image/
    │   ├── pixelate.js
    │   └── palette.js
    │
    ├── replay/
    │   └── replay.js
    │
    └── views/
        ├── editor.js
        ├── studio.js
        ├── landing.js
        ├── forgeLoader.js
        ├── replayOverlay.js
        ├── reference.js
        ├── saveModal.js
        └── autosaveModal.js
```

---

## 🚀 Getting Started

PixelVerse does not require a package installation or build step.

### Option 1 — Open the project directly

Open:

```text
pixelverse_tablet/index.html
```

### Option 2 — Run a local server

A local server is recommended for ES module imports.

#### Python

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

#### Node.js

```bash
npx serve pixelverse_tablet
```

### Main Entry Points

| File | Purpose |
|---|---|
| `index.html` | PixelVerse landing page |
| `blank.html` | Pixel editor and animation studio |
| `image.html` | Image-to-pixel-art workflow |

---

## 🎨 Design System

PixelVerse uses custom CSS variables for its visual system.

| Token | Purpose |
|---|---|
| `--pv-sky` | Main background |
| `--pv-stone-dk` | Panel background |
| `--pv-sun` | Primary action / drawing accent |
| `--pv-magenta` | Studio / secondary accent |
| `--pv-moss` | Success accent |
| `--pv-text` | Main text |

### Fonts

- **Press Start 2P** — pixel/HUD labels
- **Space Grotesk** — headings
- **Fira Sans** — body text

---

## 📱 Responsive & Tablet Support

The project includes a dedicated `css/tablet.css` layer for responsive layouts.

The editor and studio use pointer events so the drawing experience can work with both mouse and touch-based interaction.

---

## 🔒 Data & Privacy

PixelVerse's core project data is stored locally in the browser using LocalStorage.

The application does not require an account or a backend API for creating, editing, saving, or comparing artwork.

External resources such as fonts, icons, and JavaScript libraries are loaded from their respective CDNs.

---

## 📄 License

This project is open for personal and educational use.