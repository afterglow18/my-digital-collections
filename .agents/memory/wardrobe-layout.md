---
name: Wardrobe image layout strategy
description: How the closet background image is sized and overlays are positioned on the wardrobe page
---

## Strategy

The wardrobe page uses `closet-bg.png` (853×1844 PNG) as a full-screen background with interactive HTML overlays.

### Image sizing
- `<img width="100%" height="auto" position="absolute" top=0 left=0>` — fills full container width, natural height may exceed container (bottom clipped = rug/floor area).
- `useImageRect` computes the rendered image rect with content-aware scaling:
  - Full-width first: `imgH = containerW × (1844/853)`
  - Content constraint: shoes carousel bottom (`LM.rows[2].carBot = 0.800`) must land above `containerH − BAR_H`
  - If violated (iPhone SE ~375px), scale image down → slight side letterbox (~38px each side)
  - Modern iPhones (390+): zero letterboxing

### Landmark fractions
All landmark values are fractions of the rendered image width/height (0→1). `pX`, `pY`, `pW`, `pH` are helper functions that convert fractions to pixel offsets including `ir.left`.

```
doorL:   0.148   // inner left edge of closet (just inside yellow door)
doorR:   0.852   // inner right edge
badgeCY: 0.297   // items badge centre y
rows[0]: { rodCY: 0.342, carY: 0.371, carBot: 0.507 }  // TOPS
rows[1]: { rodCY: 0.543, carY: 0.564, carBot: 0.667 }  // BOTTOMS
rows[2]: { rodCY: 0.707, carY: 0.727, carBot: 0.800 }  // SHOES
hangerCX:  0.222
saveBtnL:  0.282
saveBtnR:  0.718
manneCX:   0.778
```

### Bottom bar
- HTML-rendered (image bottom is clipped), pinned to `bottom: 0`
- Two-layer: full-width cream backdrop (zIndex 19) + image-width interactive layer (zIndex 20, `left: ir.left, width: ir.width`)
- Icons use `pW(ir, fraction)` as offset within the image-width layer (correct even with letterboxing)

### Section buttons
- Large pink pill buttons replace the baked-in "TOPS/BOTTOMS/SHOES" image labels
- Centered at `rodCY` (positioned on the image's original small label, which the button covers)
- Height: `Math.max(34, Math.round(pH(ir, 0.058)))` — tall enough to cover the image's small label AND the rod
- Always visible (not conditional on item count)

**Why:** `object-fit: contain` caused 21px side letterboxing on all phones. `object-fit: cover` clips from bottom. The current `width: 100%; height: auto` approach gives zero letterboxing on modern iPhones and the content-aware scale handles SE gracefully.
