# Builder Phases 8–10 — derived plan (no prior plan doc existed)

Search of `docs/` in both repos for "phase 8 / فاز ۸ / builder-gap" found only `WP_PARITY_AUDIT.md` (WordPress parity, unrelated).
Builder phases 1–7 are recorded only in Dashboard commit messages (c38b3fe … 47f62a8). Already shipped:
navigator/clipboard/library (2), loop/widgets (3), motion/sticky/hover/bg video (4a), publish-time CSS/breakpoints/kit
export-import/fonts (4b), roles (5), SEO/scheduling/locking/a11y (5a), A/B + CMS collections + forms + display conditions (5b),
collections pro + dynamic tags + global queries (7), plus popups (`popup-rules.ts`), revisions (`RevisionsPanel.tsx`) and
custom code manager.

Remaining Elementor/Wix-parity gaps, grouped (verify each against code before starting):

## Phase 8 — Design system
- Global colour/typography tokens referenced by widgets (change once → whole site), not only copied values.
- Per-element custom CSS (`selector {}` scoping) and per-element attributes.
- Kit presets gallery (one-click apply of a full kit, with preview), shared across tenants via `@webina/ui`.

## Phase 9 — Interactions
- Scroll-triggered entrance animations + scroll/mouse effects editor parity, `prefers-reduced-motion` respected.
- Popup triggers parity: exit intent, scroll depth, inactivity, after N page views, frequency capping.
- Lottie widget hardening (lazy, off-screen pause).

## Phase 10 — Workflow
- Revision diff + named versions + restore of a single section.
- Theme builder conditions (header/footer/single/archive templates by rule) with priority.
- A/B: auto-winner at significance, multi-variant (A/B/n).

Rules: Persian/RTL/Jalali UI, settings get backward-compatible defaults, shared widget code goes to `@webina/ui`,
implement in Dashboard and ERP together.

## Status — 2026-10-28 (Asia/Tehran)

Shared logic lives in `@webina/ui` v0.6.0 (`kit-presets`, `doc-diff`, `ab-winner`, `lazy-media`) and is used by both Dashboard and ERP.

- **Phase 8, done:** the editor menu has a «کیت‌های آماده» item (`editor/KitPresetsPanel.tsx`). It offers 6 presets and changes only colours, palette, button radius and button variants, using `updateGlobals`.
  - Global colours, palette, classes and per-element custom CSS were already in place.
- **Phase 9, done:** the Lottie widget loads only near the viewport, pauses off-screen, and doesn't autoplay under `prefers-reduced-motion`.
  - Entrance animations and popup triggers (exit intent, inactivity, frequency) were already in place.
- **Phase 10, done:**
  - The revision preview shows a diff summary against the current draft ("بخش برمی‌گردد / حذف / تغییر").
  - Page settings show A/B conversion rates, lift and the winner. This uses the same z-test as `BuilderAbController`.
- **Left:**
  - Theme-builder display conditions (show a template by category or product type).
  - A/B/n with more than two variants (needs backend schema).
  - Automatically promoting the A/B winner.
  - A Lottie JSON upload helper.
