# Build context: WebinoDashboard repo root.
# @webina/ui comes from the public GitHub tag (see frontend/package.json), not a vendored packages/ folder.
# NODE_IMAGE can be overridden for IR Hub mirrors (e.g. hub.hamdocker.ir/library/node:24.22.3-alpine).
# Pin is Node >= 24.15 so Next RSC streaming avoids the Node 22 TransformStream race.
#
# APK mirror handling: dl-cdn.alpinelinux.org is Fastly-hosted and is frequently TLS-blocked
# from Iranian networks, which fails the deps stage at `apk add` before npm ever runs
# (Dockerfile.platform takes COMPOSER_MIRROR for the same class of problem). Rather than
# requiring every caller to know about a new flag, the install retries against
# APK_FALLBACK_MIRROR when the stock CDN is unreachable. APK_MIRROR forces a mirror up front;
# set APK_FALLBACK_MIRROR= to disable the retry.
# FROM-related ARGs MUST be declared before the first FROM (BuildKit global scope).
ARG NODE_IMAGE=node:24.22.3-alpine

FROM ${NODE_IMAGE} AS deps
ARG APK_MIRROR=
ARG APK_FALLBACK_MIRROR=https://mirrors.aliyun.com/alpine
WORKDIR /src
# git needed so npm can install git+https://github.com/WebinaDev/webina-ui.git#v0.1.0
# `[s]*` keeps the pattern BRE-portable (BusyBox sed has no `\?`) and matches http:// and https://.
RUN set -eux; \
    if [ -n "${APK_MIRROR}" ]; then \
      sed -i "s|http[s]*://dl-cdn.alpinelinux.org/alpine|${APK_MIRROR}|g" /etc/apk/repositories; \
    fi; \
    if ! apk add --no-cache git ca-certificates; then \
      if [ -z "${APK_FALLBACK_MIRROR}" ]; then \
        echo "apk add failed and APK_FALLBACK_MIRROR is disabled" >&2; \
        exit 1; \
      fi; \
      echo "apk add failed against the stock Alpine CDN; retrying via ${APK_FALLBACK_MIRROR}" >&2; \
      sed -i "s|http[s]*://dl-cdn.alpinelinux.org/alpine|${APK_FALLBACK_MIRROR}|g" /etc/apk/repositories; \
      cat /etc/apk/repositories; \
      apk add --no-cache git ca-certificates; \
    fi
COPY frontend/package.json frontend/package-lock.json ./frontend/
WORKDIR /src/frontend
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS builder
WORKDIR /src
COPY frontend ./frontend
COPY --from=deps /src/frontend/node_modules ./frontend/node_modules
WORKDIR /src/frontend
ENV NEXT_TELEMETRY_DISABLED=1
ARG API_PROXY_TARGET=http://backend:8080
ENV API_PROXY_TARGET=${API_PROXY_TARGET}
ARG INTERNAL_API_URL=http://backend:8080
ENV INTERNAL_API_URL=${INTERNAL_API_URL}
# Optional imgproxy base (e.g. /img); empty = built-in Next/sharp optimizer. Inlined at build time.
ARG NEXT_PUBLIC_IMG_PROXY_BASE=
ENV NEXT_PUBLIC_IMG_PROXY_BASE=${NEXT_PUBLIC_IMG_PROXY_BASE}
RUN npm run build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG INTERNAL_API_URL=http://backend:8080
ENV INTERNAL_API_URL=${INTERNAL_API_URL}
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /src/frontend/public ./public
COPY --from=builder --chown=nextjs:nodejs /src/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /src/frontend/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
