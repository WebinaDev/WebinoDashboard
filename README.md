# Webino

Customer-facing e-commerce and corporate site platform (Laravel + Next.js).

## Installation

Server installation, control panel, and multi-site management are handled by **[WebinoServerManager](https://github.com/WebinaDev/WebinoServerManager)** — not this repository.

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/WebinaDev/WebinoServerManager/main/bootstrap.sh)
```

Then from the control panel or CLI:

```bash
webina product install Webino
webina site create --slug shop1 --domain shop1.example.com --product Webino
```

## Automated provisioning (WebinoERM Site Builder)

For production multi-tenant rollouts, sites are created from **WebinoERM** (`admin/site-builder/provisions/new`):

1. ERM admin selects business category, type, package, and domain.
2. ERM issues a `core_licenses` row and calls **WebinoServerManager** `POST /api/v1/sites` with env injection (`TENANT_LICENSE_KEY`, `TENANT_SEED_JSON`).
3. WebinoServerManager runs `webina site create` (Caddy SSL after DNS).
4. ERM calls `POST /api/v1/provision/bootstrap` on the new site to seed tenant, sync modules, and open the setup wizard.

Corporate packages (`agency`, `startup`) receive theme `corporate-demo-v1`, sample CMS pages, blog/portfolio/team content, and consultation sync to ERP.

Configure WebinoServerManager in ERM under **Hosting & infrastructure** (`webinoserver_panel_url`, API token, `platform_base_domain`).

## URL structure

| Area | Path | Auth |
|------|------|------|
| Public site (SSR) | `/`, `/blog`, `/academy`, `/portfolio`, `/team`, `/announcements`, `/testimonials`, `/consultation`, `/pages/[slug]` | None |
| Admin dashboard | `/admin/*` | Required |
| Login | `/login` | Public |
| Setup wizard | `/setup` | Required |

The public site and admin dashboard share the same domain. Middleware allows anonymous access to public routes and protects `/admin/*`.

## Public API

Unauthenticated tenant-scoped endpoints under `/api/v1/public/*` (resolved by `Host` header):

- `GET /tenant` — tenant branding and theme
- `GET /home` — home page blocks aggregate
- `GET /blog`, `/blog/{slug}`, `/blog/category/{slug}`
- `GET /academy`, `/academy/{slug}`
- `GET /portfolio`, `/portfolio/{slug}`
- `GET /announcements`, `/testimonials`, `/team`
- `GET /pages/{slug}`
- `POST /consultations` — public form; auto-syncs to ERP via queue job

## Corporate modules

| Module | Public | Admin |
|--------|--------|-------|
| `blog` | `/blog` | `/admin/blog` |
| `academy` | `/academy` | `/admin/academy` |
| `portfolio` | `/portfolio` | `/admin/portfolio` |
| `announcements` | `/announcements` | `/admin/announcements` |
| `testimonials` | `/testimonials` | `/admin/testimonials` |
| `team` | `/team` | `/admin/team` |
| `consultations` | `/consultation` | `/admin/consultations` |
| `cms` | `/pages/[slug]` | `/admin/cms` |

Blog is enabled for all site types (retail, corporate, resume). Corporate-only modules ship with `agency` and `startup` packages in Site Builder.

## Consultation sync (Webino → ERP)

1. Visitor submits `/consultation` form → `POST /api/v1/public/consultations`
2. `SyncConsultationToErmJob` posts to ERM `POST /api/webinocrm/v1/consultations/ingest`
3. ERP creates `CrmConsultation`; Webino stores `erp_consultation_id`

Requires `WEBINO_BASE_URL`, `TENANT_PROVISION_TOKEN`, and HMAC secret on both sides.

## Themes

Default corporate theme: `corporate-demo-v1` in `frontend/src/themes/corporate-demo-v1/`. Registered in ERM marketplace at `admin/marketplace/themes`. Brand-book polish is a follow-up phase.

## Local development

```bash
docker compose up -d redis
cd backend && composer install && php artisan migrate --seed && php artisan octane:start --server=frankenphp --host=0.0.0.0 --port=8080
cd frontend && npm install && npm run dev    # http://localhost:3000
```

- Public site: http://localhost:3000/
- Admin: http://localhost:3000/admin (login: `admin@example.com` / `password`)

## Project structure

```
backend/     Laravel API (Octane/FrankenPHP)
frontend/    Next.js — public (site) + admin routes
  app/(site)/   Public SSR pages
  app/admin/    Dashboard under /admin/*
  src/themes/   Visual theme packages
docker/      Dockerfiles used by WebinoServerManager to build platform images
```

Platform images (`docker/php/Dockerfile.platform`) are built when you run `webina product install Webino` on a server managed by WebinoServerManager.

See [ARCHITECTURE.md](ARCHITECTURE.md) and [FEATURES.md](FEATURES.md) for product specifications.
