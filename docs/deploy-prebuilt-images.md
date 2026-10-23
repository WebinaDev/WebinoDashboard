# Deploying prebuilt images (no builds on the server)

`.github/workflows/images.yml` builds on every push to `main` and pushes to GHCR:

| Image | Dockerfile | Used by |
|---|---|---|
| `ghcr.io/webinadev/webino-dashboard-backend` | `docker/php/Dockerfile.platform` | backend, worker, scheduler |
| `ghcr.io/webinadev/webino-dashboard-frontend` | `docker/next/Dockerfile` | frontend |

Tags: full sha, short sha, `latest` (main). Cache `type=gha`.

## Tenant sites (the production use)

Tenant stacks are created by WebinoERP (`TenantSiteStack`) and use local tags `webino-backend:<tag>`
/ `webino-next:<tag>`. On the ERP server run WebinoERP's
`WEBINO_DASHBOARD_IMAGE_TAG=<this repo's SHA> scripts/pull-webino-dashboard-images.sh`, which pulls these
images and retags them. Then recreate + migrate each site from the ERP panel. See WebinoERP/docs/deploy-prebuilt-images.md.

## Standalone Dashboard stack

```
IMAGE_TAG=<SHA> scripts/deploy-pull.sh                                   # docker-compose.aapanel.yml
IMAGE_TAG=<SHA> COMPOSE_FILES=docker-compose.yml:docker-compose.prod.yml scripts/deploy-pull.sh
```
Rules: full 40-char sha required (`ALLOW_LATEST=1` to bypass); optional CI-green check with
`GITHUB_TOKEN`; `COMPOSE_PROJECT` optional; `docker-compose.prod-images.yml` appended last
(overrides backend/worker/scheduler/frontend; db/redis/web are upstream images);
`pull`, `up -d --no-build` (no `--remove-orphans`), then `php artisan migrate --force` like `scripts/update.sh`.

## Build-time env

No per-tenant `NEXT_PUBLIC_*` is passed at build time (relative `/api`, runtime proxy env), so one
frontend image serves every tenant. If per-site public values are ever needed, inject at runtime.

## Server setup

`echo "<token with read:packages>" | docker login ghcr.io -u <user> --password-stdin`, and verify ghcr.io is reachable.
