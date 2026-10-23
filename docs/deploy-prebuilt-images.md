# Deploying prebuilt images (no builds on the server)

The production server has 8 GB RAM; building Next.js there can OOM the box. GitHub Actions
(`.github/workflows/images.yml`) now builds the production images on every push to `main`
and pushes them to GHCR. The old build-on-server path is unchanged and still works.

## Images

| Image | Dockerfile | Tags |
|---|---|---|
| `ghcr.io/webinadev/webino-dashboard-backend` | `docker/php/Dockerfile.platform` | `latest`, full sha, short sha |
| `ghcr.io/webinadev/webino-dashboard-frontend` | `docker/next/Dockerfile` | `latest`, full sha, short sha |

Layer cache: `type=gha` (per image scope). Auth: `GITHUB_TOKEN` with `packages: write`.
Base images come from Docker Hub in CI (no Iran mirror needed there).

## Build-time env (Next.js)

`NEXT_PUBLIC_*` values are inlined at `next build`. The current Dockerfiles do **not** pass any
per-tenant/per-site value at build time (API calls use relative `/api` via the server-side proxy
`API_PROXY_TARGET/INTERNAL_API_URL=http://backend:8080`, which are read at runtime), so one image
serves every site and the CI image is byte-for-byte equivalent to what the server builds today.
Setting a `NEXT_PUBLIC_*` in compose `environment:` has no effect on client code (true before too).
If a per-site public value is ever needed, prefer runtime injection (server component / `/api/config`
read from env) over a per-site build matrix (N images, N× CI time).

## One-time server setup

1. Create a GitHub token that can read packages (classic PAT with `read:packages`, or fine-grained
   with Packages: read on WebinaDev). Then on the server:
   ```
   echo "<TOKEN>" | docker login ghcr.io -u <github-username> --password-stdin
   ```
   (Or make the GHCR packages public and skip login.)
2. Check the server can reach `ghcr.io` (`docker pull ghcr.io/webinadev/webino-dashboard-frontend:latest`).
   If ghcr.io is blocked/slow from the server's network, a mirror/proxy is needed.

## Deploy

```
scripts/deploy-pull.sh                         # latest, base docker-compose.aapanel.yml
IMAGE_TAG=<git sha> scripts/deploy-pull.sh     # pin / roll back
COMPOSE_BASE=docker-compose.prod.yml scripts/deploy-pull.sh
```
It runs `docker compose -f <base> -f docker-compose.prod-images.yml pull` then `up -d --no-build`.
Wait for the Actions run of the commit to be green before deploying it.
Migrations still run as before (container entrypoint / `php artisan migrate --force`).

