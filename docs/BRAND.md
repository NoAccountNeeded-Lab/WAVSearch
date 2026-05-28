# Brand And UI Guidelines

WAV Search is a practical search tool for wheelchair accessible vehicles. The product should feel clear, trustworthy, fast, and calm. It should not feel like a generic car marketplace or a marketing landing page.

## Product Principles

- Search and comparison come first.
- Accessibility is part of the product value, not a compliance add-on.
- Data density is good when it remains scannable.
- Mobile layouts must support real shopping workflows, not just shrink desktop UI.
- Copy should be direct and plain.

## Visual Direction

- Use restrained, high-contrast interfaces.
- Prefer functional layout over decorative sections.
- Use cards only for repeated listings, modals, and framed tools.
- Keep controls familiar: selects, checkboxes, segmented controls, sliders, icon buttons with labels where needed.
- Avoid visual treatments that make information harder to compare.

## Layout Rules

- Listing pages should prioritize filters, map/list context, result count, price, mileage, location, and WAV-specific features.
- Detail pages should prioritize image, price, location, conversion details, access equipment, seller contact, and source link.
- Use full-width sections or constrained content areas; do not nest cards inside cards.
- Every interactive control needs a stable size so labels, hover states, and dynamic values do not shift layout.

## Accessibility Rules

- Target WCAG 2.1 AA.
- All controls must be reachable and usable by keyboard.
- Focus states must be visible.
- Form controls need programmatic labels.
- Error, loading, empty, and no-results states need readable text.
- Color cannot be the only way to communicate status.
- Maps must not be the only way to access listing locations.

---

## Color System

### Semantic Token Architecture

Themes are defined as a mapping of **semantic tokens → Radix Color scale steps**. Tokens reference step positions, not specific color values. This means swapping the primary scale (e.g. Teal → Orange) cascades through the entire UI automatically.

Every theme must define these semantic tokens:

```css
/* Primary scale — drives interactive elements, chart fills, links */
--color-primary-subtle:   /* step 3  — tinted background, hover states */
--color-primary-ui:       /* step 5  — UI element background */
--color-primary-border:   /* step 7  — borders, dividers */
--color-primary-solid:    /* step 9  — solid fill, chart bars, buttons */
--color-primary-text:     /* step 11 — text on light background */

/* Accent scale — secondary highlights, tags, badges */
--color-accent-subtle:    /* step 3 */
--color-accent-solid:     /* step 9 */
--color-accent-text:      /* step 11 */

/* Neutral scale — always Slate, never changes between themes */
--color-bg:               /* Slate 1  — page background */
--color-surface:          /* Slate 2  — card/section background */
--color-border:           /* Slate 6  — default border */
--color-border-strong:    /* Slate 8  — emphasized border */
--color-text:             /* Slate 12 — body text */
--color-text-secondary:   /* Slate 11 — secondary/muted text */
--color-text-placeholder: /* Slate 9  — placeholder text */
```

Status colors are **fixed across all themes** — never theme-dependent:

```css
--color-success:  /* Green 9  */
--color-warning:  /* Amber 9  */
--color-error:    /* Red 9    */
--color-info:     /* Blue 9   */
```

### Future custom primary color

This token architecture is intentionally compatible with custom primary colors. A user-chosen hue would generate a Radix-compatible 12-step scale (Radix publishes their generation algorithm) and feed into the same semantic slots. Do not hard-code hex values inside components — always use semantic tokens.

---

## Seasonal Themes

Themes rotate automatically by calendar date. Users can override manually; the override is persisted to `localStorage`.

| Season | Months | Primary Scale | Accent Scale | Feel |
|--------|--------|---------------|--------------|------|
| Spring | Mar – May | `Jade` | `Grass` | Fresh, green, hopeful |
| Summer | Jun – Aug | `Teal` | `Sky` | Bright, open, airy |
| Fall | Sep – Nov | `Orange` | `Amber` | Warm, rich, high contrast |
| Winter | Dec – Feb | `Indigo` | `Slate` | Calm, cool, structured |

### Theme switching behavior

- Default: auto-rotate based on the current month (server date, not client clock).
- Manual override: user selects a season from the theme switcher; selection written to `localStorage` key `wav-theme`.
- A stored value of `"auto"` or an absent key both mean auto-rotate.
- The `data-theme` attribute on `<html>` drives all CSS token overrides: `data-theme="spring"`, `"summer"`, `"fall"`, `"winter"`.

### Theme switcher UI

- Lives in the site header, right-aligned.
- Compact control: a labeled icon button showing the current season name + a small season glyph (leaf, sun, etc.) from Lucide.
- Opens a small popover with five options: Auto, Spring, Summer, Fall, Winter.
- "Auto" is the default selection; shows the current auto season in parentheses: "Auto (Fall)".
- Minimum tap target 48×48px.
- Does not use color alone to distinguish options — each has a text label.

### Chart fills in themed contexts

Chart bars and pie slices for **data** use `--color-primary-solid` (step 9) for active/selected and `--color-border` (Slate 6) for dimmed/unselected — never theme accent colors for data, to avoid ambiguity with status colors.

The **vehicle color picker** filter is a special case: swatches use the actual vehicle color (white, black, silver, red, etc.) with a `--color-border` ring for contrast on light swatches. These are not themed.

---

## Implementation Contract

Before changing user-facing UI, agents and developers should check:

- `docs/BRAND.md`
- `.github/instructions/web-accessibility.instructions.md`
- Existing component styles in `apps/web/src`

If a new UI pattern is introduced, update this file or create a follow-up issue for designer review.
