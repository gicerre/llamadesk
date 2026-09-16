# Brand

The symbol is a capital **L**: the upright is a llama's neck, the head and ears sit on top, and
the foot is the desk. It says the name (L for LlamaDesk), the animal and the workplace with three
shapes.

<img src="assets/brand/app-icon.svg" width="96" alt="LlamaDesk app icon" />

## One source

`src/components/brand/geometry.json` describes the symbol on a 512 grid as rounded rectangles
with per-corner radii — where two shapes meet, the shared corner is square, so the outline stays
continuous. Everything else is generated from it:

| Use | Where |
| --- | --- |
| Interface (title bar, welcome screen) | `BrandMark`, `Wordmark`, `Logo` in `src/components/brand/BrandMark.tsx` |
| Opening animation | `src/app/Opener.tsx` animates the individual parts |
| Windows icons (`.ico` 16–256, PNG set) | `npm run icons` → `scripts/brand.mjs` + `tauri icon` |
| Vector files | `docs/assets/brand/*.svg`, written by the same script |

Changing the symbol means editing `geometry.json` and running `npm run icons`.

## The set

| Variant | File | When to use it |
| --- | --- | --- |
| App icon | [`assets/brand/app-icon.svg`](assets/brand/app-icon.svg) | Installer, taskbar, Start menu |
| Symbol | [`assets/brand/symbol.svg`](assets/brand/symbol.svg) | On light backgrounds, 32 px and above |
| Symbol, dark | [`assets/brand/symbol-dark.svg`](assets/brand/symbol-dark.svg) | On dark backgrounds |
| Symbol, small | [`assets/brand/symbol-small.svg`](assets/brand/symbol-small.svg) | Up to 32 px: the ears merge with a notch |
| Monochrome | [`assets/brand/symbol-mono.svg`](assets/brand/symbol-mono.svg) | Print, engraving, overlays |
| Full logo | [`assets/brand/logo-light.svg`](assets/brand/logo-light.svg), [`assets/brand/logo-dark.svg`](assets/brand/logo-dark.svg) | Documents, screenshots, the web |

The wordmark is "LlamaDesk" in Segoe UI Variable Display semibold, −2% letter-spacing, in the ink
colour: the brand colour lives only in the desk.

## Colours

| Role | Light | Dark | On the tile |
| --- | --- | --- | --- |
| Ink | `#14191B` | `#E6EBEA` | `#EEF2F1` |
| Titicaca (the desk) | `#1D7384` | `#5BB6C6` | `#4FB3C4` |
| Graphite tile | — | — | `#262D31` → `#1B2023` |

Inside the app the accent is the colour of the workspace; Titicaca appears in the symbol and
during the opening animation, then fades into the workspace colour.

## Rules

- Tile: corner radius 22.5% of the side; symbol at 80% (94% up to 32 px).
- Clear space: half the width of the neck on every side.
- Do not rotate it, skew it, separate the desk from the neck, or recolour the desk with a
  workspace accent.
- Below 16 px use the tile only, never the bare symbol.

## The opening animation

It plays only on a cold start, when the *Opening animation* setting is on, the app did not start
in the tray, and Windows is not asking for reduced motion. The window itself appears only once the
first frame is painted, so there is no white flash; if the frontend does not answer within three
seconds, the backend shows the window anyway.

| Time | What happens |
| --- | --- |
| 0–220 ms | The desk extends from the left |
| 120–380 ms | The neck rises |
| 300–520 ms | The head grows out of the neck, then the two ears |
| 420–640 ms | The name appears |
| 650–950 ms | The name fades, the symbol flies to the title bar, the backdrop dissolves and the accent moves from Titicaca to the workspace colour |

The shell loads underneath in the meantime, so the animation never delays startup. From the
palette: `> Replay the opening animation`.
