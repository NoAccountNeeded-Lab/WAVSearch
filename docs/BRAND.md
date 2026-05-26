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

## Implementation Contract

Before changing user-facing UI, agents and developers should check:

- `docs/BRAND.md`
- `.github/instructions/web-accessibility.instructions.md`
- Existing component styles in `apps/web/src`

If a new UI pattern is introduced, update this file or create a follow-up issue for designer review.
