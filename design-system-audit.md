# Design System Audit — WAV Search

**Date:** 2026-05-29 | **Scope:** `apps/web` + `packages/charts` | **Maturity:** Early / ad hoc

---

## Summary

| Area | Issues found | Score |
|---|---|---|
| Naming consistency | 3 parallel token systems | 4/10 |
| Token coverage | ~25 hardcoded values in 5 files | 5/10 |
| Component completeness | StatCard unstyled; charts use wrong brand colors | 5/10 |
| Accessibility | Strong foundations, 3 gaps | 7/10 |
| Documentation | None exists | 1/10 |

**Overall: 4/10** — The CSS foundation in `globals.css` is well-structured, but two layers of AI-generated code below it didn't use the tokens. The biggest wins are (1) consolidating to one token system and (2) deleting the hardcoded hex values in `filters/[id]/page.tsx`.

---

## 1. Naming consistency

### Problem: Three token systems for the same concepts

The codebase has three overlapping systems that all express the same values:

| System | Prefix | Example | Where used |
|---|---|---|---|
| Custom brand tokens | `--clr-*` | `var(--clr-primary)` | CSS modules (good) |
| Tailwind v4 theme | `--color-*` | `var(--color-primary)` | Available but unused |
| shadcn HSL vars | `--primary`, `--border` | `hsl(var(--primary))` | `ui/slider.tsx`, `ui/chart.tsx` |

CSS modules (`*.module.css`) use `--clr-*` consistently and correctly. But shadcn components use their own `--primary` / `--border` / `--muted` variables, and `packages/charts` components default to `var(--primary, #6366f1)` — which resolves to the shadcn value, not the `--clr-primary` brand blue.

### Recommendation

Pick one canonical name per concept and use it everywhere. The `--clr-*` prefix works fine — just alias the shadcn variables to them at the `:root` level (already partially done in `globals.css`). Then update `packages/charts` defaults to reference `var(--clr-primary)`.

---

## 2. Token coverage

### Hardcoded values by file

**`apps/web/src/app/filters/[id]/page.tsx` — worst offender (~15 hardcoded values)**

All inline `style={{}}` blocks use raw hex. Examples:
- `color: '#0066CC'` — not the brand blue (`#0052a3`), a slightly different shade
- `background: '#e8f0fe'`, `color: '#1a56db'` — one-off blue tints, not from the palette
- `color: '#059669'` — hardcoded success green instead of `var(--clr-feature)`
- `color: '#9ca3af'`, `color: '#374151'` — gray values not from the token set

This file appears to have been written without access to the design tokens. It should be refactored to use a CSS module (like the other pages do) or at minimum replace inline values with `var(--clr-*)` references.

**`apps/web/src/app/filters/[id]/loading.tsx`**

Every skeleton shape uses `background: '#e5e7eb'` — this is literally the value of `--clr-border`. Should be `var(--clr-border)` or a new `--clr-skeleton` token.

**`apps/web/src/components/ImageGallery.tsx`**

Uses `#f0f0f0`, `#999`, and `#0066CC` in inline styles. The `#0066CC` doesn't match the brand primary (`#0052a3`).

**`apps/web/src/components/ListingsMap.tsx`**

Map pin color is hardcoded as `#2563eb` (Tailwind blue-600), not the brand primary. This means the map pins are a slightly different blue than everything else on the page.

**`packages/charts/src/DonutChart.tsx`**

Default `colorScheme` uses indigo/purple fallbacks (`#6366f1`, `#8b5cf6`, etc.) — the generic shadcn palette, not the brand's blue-and-green. The `--chart-1` through `--chart-5` variables defined in `globals.css` are the right values; the chart defaults should fall back to those.

**`packages/charts/src/RangeSlider.tsx`**

Track uses `bg-gray-200` (hardcoded Tailwind class) and the active range uses `var(--primary, #6366f1)` — again the wrong fallback.

### Quick count

| Category | Token refs | Hardcoded values |
|---|---|---|
| Colors | ~80 correct uses of `var(--clr-*)` | ~25 hardcoded hex values |
| Spacing | All relative/rem — no arbitrary values | — |
| Typography | `var(--font)` used consistently | — |
| Shadows | `rgba(0, 82, 163, 0.1)` repeated in 2 places | Could be a token |

---

## 3. Component completeness

### `packages/charts/src/StatCard.tsx` — no styles at all

```tsx
// Current: raw divs, no styling
export function StatCard({ value, label, colorScheme, className }: StatCardProps) {
  return (
    <div className={className}>
      <p style={colorScheme ? { color: colorScheme } : undefined}>...</p>
      <p>{label}</p>
    </div>
  )
}
```

The component has no default visual treatment — no font size, no weight, nothing. It relies entirely on the consumer providing `className`. Compare to the `statCard` / `statValue` / `statLabel` styles that already exist in `page.module.css` — those are page-specific, not reusable. Either add a CSS module to `packages/charts` or document that `StatCard` is intentionally unstyled and consumers must provide all styling.

### `packages/charts` has no shared token access

The charts package has no CSS file and no way to import brand tokens. It can only reach tokens via inherited CSS variables on the page. This works at runtime but means the default prop values (fallback colors) are wrong — they fall back to generic Tailwind colors, not the brand palette. The package needs either a bundled CSS file that re-exposes `--clr-primary` etc., or its default props should be updated to reference the correct variable names without fallbacks (e.g., `colorScheme = 'var(--clr-primary)'`).

### State coverage

| Component | Default | Hover | Focus | Disabled | Loading | Error |
|---|---|---|---|---|---|---|
| `CategoryBarChart` bar button | ✅ | ✅ | ✅ | — | — | — |
| `PriceHistogram` | ✅ | — | ✅ | — | — | — |
| `SortSelect` | ✅ | ✅ | ✅ | — | — | — |
| `StatCard` | ❌ unstyled | — | — | — | — | — |
| `BarChart` | ✅ | — | — | — | — | — |
| `DonutChart` | ✅ | — | — | — | — | — |
| `RangeSlider` | ✅ | — | ✅ | ✅ | — | — |
| Listing card | ✅ | ✅ | ✅ | — | ✅ skeleton | — |
| Pagination button | ✅ | ✅ | — | ✅ | — | — |

---

## 4. Accessibility

### What's working well

- Skip link with keyboard reveal (`position: absolute; top: -9rem` → visible on focus)
- `.sr-only` utility class in globals
- `prefers-reduced-motion` and `forced-colors` media queries in globals
- Global `:focus-visible` ring using the brand color
- `aria-live="polite"` on results count and status update timestamp
- `aria-label` required on all chart components (enforced via TypeScript)
- Data tables inside `<details>` as fallback for `BarChart` and `DonutChart`

### Gaps

**1. `RangeSlider` — missing thumb labels**

A two-thumb range slider should give each thumb a distinct accessible label (e.g., "Minimum price" and "Maximum price"). Currently only one `aria-label` is passed to the root element. Radix's `SliderPrimitive.Thumb` accepts its own `aria-label`.

**2. `ImageGallery` — no keyboard arrow navigation**

Thumbnail buttons use `aria-pressed` correctly, but there's no keyboard handler for arrow keys. The ARIA button pattern for a gallery/carousel expects left/right arrows to cycle through thumbnails. Currently only Tab + Enter/Space work.

**3. `filters/[id]/page.tsx` — inline styles have no focus styles**

The CTA button (`background: '#0066CC'`) is a plain `<a>` with inline styles and no `:focus-visible` rule. It will use the browser default outline, which conflicts with the custom focus ring used everywhere else.

---

## 5. Documentation

Nothing exists. No README for `packages/charts`, no component usage examples, no token reference, no decision log explaining why the design looks the way it does.

Given the system is early-stage, the highest-ROI documentation would be:

1. A token reference table in `globals.css` (just inline comments are fine)
2. A README for `packages/charts` explaining what each component expects
3. Usage examples for `CategoryBarChart` and `PriceHistogram` (these are the most complex)

---

## Priority actions

### P0 — Fix now (token breakage, wrong colors)

1. **Replace all hardcoded hex in `filters/[id]/page.tsx`** with `var(--clr-*)` references or extract to a CSS module. The `#0066CC` values don't even match the brand primary.
2. **Fix `packages/charts` default color fallbacks** — change `var(--primary, #6366f1)` to `var(--clr-primary)` in `BarChart`, `RangeSlider`, and `DonutChart`.
3. **Fix `RangeSlider` track** — replace `bg-gray-200` with `bg-[var(--clr-border)]` or a CSS variable.
4. **Fix map pin color** in `ListingsMap.tsx` — `#2563eb` → `var(--clr-primary)`.

### P1 — Fix soon (consistency, accessibility)

5. **Style `StatCard`** — add a CSS module or document clearly that it's intentionally headless.
6. **`loading.tsx` skeletons** — replace `#e5e7eb` with `var(--clr-border)`.
7. **`RangeSlider` thumb labels** — add `aria-label` to each `SliderPrimitive.Thumb`.
8. **`ImageGallery` keyboard navigation** — add `onKeyDown` handler for arrow keys.

### P2 — Plan for later (structure, docs)

9. **Consolidate token systems** — decide whether `--clr-*` or `--color-*` is canonical and eliminate the other.
10. **`packages/charts` CSS** — add a `tokens.css` that re-exports brand variables as chart-specific names.
11. **Document components** — at minimum a README for `packages/charts`.

---

## What's worth keeping

The `globals.css` token structure is genuinely solid for a project this early. The decision to map shadcn's HSL variables to the brand palette is correct. The CSS module approach in `apps/web` is well-executed — consistent token usage, good hover/focus patterns, responsive layout. The accessibility foundations (skip link, sr-only, focus ring, reduced motion) are better than most early-stage projects.

The main problem is that two bodies of code — `filters/[id]/page.tsx` and `packages/charts` — appear to have been written without access to the token system and need to be brought in line with the rest.
