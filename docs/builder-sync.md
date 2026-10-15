# Builder sync with WebinoERP

Shared builder core lives in `@webina/ui/builder` (`packages/webina-ui/src/builder`, built to `dist/builder`).
Dashboard vendors `packages/webina-ui` in this repo (Docker builds from the repo root), so the
`builder/` folder is synced from the sibling `Plugins/Webina/packages/webina-ui` used by ERP (f7a4642).
When the shared package changes, copy `src/builder` and `dist/builder` (or rebuild) into both consumers.

Dashboard consumes:

- `forms.ts`, `ids.ts`, `lang.ts`, `render/icon-options.ts`: re-exports from the package.
- `registry-content.ts`: `sharedContentWidgets(ICON_OPTIONS)` (section-heading, steps, icon-cards, badges, cta-banner, comparison-table) and `sharedFormWidget(...)` with Dashboard labels and defaults.
- `registry.ts`: `createWidgetRegistry(core)` + `COMMERCE_PLUGIN` (`registry-commerce.ts`, Dashboard-only Iranian commerce widgets).
- `render/form-widget.tsx`: `publicFormEndpoints(API/api, "/v1/public/builder/forms")`, `checkFormUpload`, `FORM_UPLOAD_ACCEPT`.

Backend: `POST /api/v1/public/builder/forms/{key}` (submit) and `POST /api/v1/public/builder/forms/{key}/upload`.
Legacy `POST /forms/submit` and `POST /builder/forms/upload` remain. Upload rule: 10 MB, jpg/jpeg/png/webp/pdf/doc/docx/zip.
Note: the reverse proxy and PHP (`client_max_body_size`, `upload_max_filesize`, `post_max_size`) must allow 10 MB.
