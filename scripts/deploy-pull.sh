#!/usr/bin/env bash
# Deploy using prebuilt GHCR images (no docker build on the server).
# Usage: scripts/deploy-pull.sh            # :latest
#        IMAGE_TAG=<git sha> scripts/deploy-pull.sh
#        COMPOSE_BASE=docker-compose.prod.yml scripts/deploy-pull.sh
# Requires: docker login ghcr.io (read:packages token). See docs/deploy-prebuilt-images.md
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${COMPOSE_BASE:-docker-compose.aapanel.yml}"
export IMAGE_TAG="${IMAGE_TAG:-latest}"
files=(-f "$BASE" -f docker-compose.prod-images.yml)
echo "[deploy-pull] base=$BASE tag=$IMAGE_TAG"
docker compose "${files[@]}" pull
docker compose "${files[@]}" up -d --no-build --remove-orphans
docker compose "${files[@]}" ps
