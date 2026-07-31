# Design QA

## Evidence

- Source visual truth: `C:\Users\13973\AppData\Local\Temp\tower-crane-selector-qa-20260801-evidence\source-desktop.png`
- Implementation screenshot: `C:\Users\13973\AppData\Local\Temp\tower-crane-selector-qa-20260801-evidence\implementation-desktop.png`
- Mobile source: `C:\Users\13973\AppData\Local\Temp\tower-crane-selector-qa-20260801-evidence\source-mobile.png`
- Mobile implementation: `C:\Users\13973\AppData\Local\Temp\tower-crane-selector-qa-20260801-evidence\implementation-mobile.png`
- Desktop viewport: 1280 × 720 CSS px; full-page captures: 1264 × 1173 px; device scale factor 1.
- Mobile viewport: 390 × 844 CSS px; full-page captures: 374 × 1697 px; device scale factor 1.
- State: default Chinese selector state at 50 m, 6 t, height unchecked, attachment allowed, all crane types, all foundations.

## Full-view comparison

The source and implementation were captured at matching desktop and mobile viewports and reviewed together. The cloned source, layout, typography, colors, borders, radii, SVG crane illustration, controls, result cards, copy, and fixed mobile-width behavior match the reference. No actionable P0/P1/P2 difference was found.

## Focused comparison

No separate crop was needed because the source and implementation use the same self-contained `index.html`, and all important control labels and primary panels were readable in the matching full-page captures. The performance-curve and comparison states were also captured from the source and exercised in the implementation.

## Required fidelity surfaces

- Fonts and typography: matching `Noto Sans SC`, `PingFang SC`, `Microsoft YaHei`, sans-serif stack, weights, sizes, wrapping, and hierarchy.
- Spacing and layout rhythm: matching desktop grid, card spacing, control sizing, radii, shadows, fixed navigation, and original mobile clipping behavior.
- Colors and visual tokens: matching green, neutral backgrounds, borders, active states, and semantic emphasis.
- Image quality and asset fidelity: all visible crane, curve, and comparison graphics use the original embedded SVG implementation; no placeholder or approximate replacement assets.
- Copy and content: matching Chinese labels, engineering notes, model data, result text, and exclusion guidance.

## Interaction verification

- Opened “查看性能曲线” and confirmed the curve page rendered.
- Added the recommended crane to comparison.
- Opened “对比 1” and confirmed the model comparison page rendered.
- Returned to “选型”.
- Checked browser console warnings and errors: none.
- Ran the production build successfully.

## Comparison history

- First pass: no P0/P1/P2 mismatch; no visual fixes required.

## Findings

- No actionable P0/P1/P2 findings.

## Follow-up polish

- The original site uses a fixed minimum width on mobile and is horizontally clipped at 390 px. This is intentionally retained for source fidelity.

final result: passed
