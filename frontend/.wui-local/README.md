# @webina/ui

Shared UI primitives for Webina products (ERP and Dashboard).

## Contents

- **Accent palette** — `data-accent` helpers (`zinc`, `slate`, `blue`, `green`, `rose`, `orange`)
- **Charts** — accent-aware Recharts bar chart
- **API envelope** — unwrap `{ success, data, message, meta, errors }` responses

## Install (monorepo / local)

```json
"@webina/ui": "file:../../packages/webina-ui"
```

## Publish (Gitea package registry)

```bash
npm run build
npm publish --registry https://git.webina.ir/api/packages/webina/npm/
```

## Usage

```tsx
import { AccentBarChart, unwrapApiData, persistAccent } from "@webina/ui"
import "@webina/ui/styles/themes.css"
```

## Install (git)

`dist/` is committed so consumers can install without a build step:

```json
"@webina/ui": "git+https://github.com/WebinaDev/webina-ui.git#v0.2.0"
```

Rebuild with `npm run build` and commit `dist/` before tagging a new version.
Exports: `@webina/ui`, `@webina/ui/builder`, `@webina/ui/styles/themes.css`.

## Builder (`@webina/ui/builder`)

Shared editor schemas/defaults for ERP + Dashboard (renderers stay per platform):

- Content: section-heading, steps, icon-cards, badges, cta-banner, comparison-table, **team-grid**
- Media: **video-embed**, **audio-block**, **before-after**, **lottie**
- Forms: form (+ captcha / webhook / CRM), **login-form**, **register-form**
- Layout: **section**, **columns**, **off-canvas**, **flex-container**, **grid-container**
- Chrome: **site-header**, **site-footer**
- Motion helpers: `entranceAnimClass`, `sharedMotionFields`, `defaultBackgroundVideo`
