# Build context: WebinoDashboard repo root (self-contained, includes packages/webina-ui)
# NODE_IMAGE can be overridden for IR Hub mirrors (e.g. hub.hamdocker.ir/library/node:22-alpine).
# FROM-related ARGs MUST be declared before the first FROM (BuildKit global scope).
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /src
COPY packages/webina-ui ./packages/webina-ui
COPY frontend/package.json frontend/package-lock.json ./frontend/
WORKDIR /src/packages/webina-ui
RUN npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
WORKDIR /src/frontend
# Fall back to npm install when package.json and the lockfile drifted (ci is strict).
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

FROM ${NODE_IMAGE} AS builder
WORKDIR /src
COPY packages/webina-ui ./packages/webina-ui
COPY frontend ./frontend
COPY --from=deps /src/frontend/node_modules ./frontend/node_modules
COPY --from=deps /src/packages/webina-ui/node_modules ./packages/webina-ui/node_modules
WORKDIR /src/frontend
ENV NEXT_TELEMETRY_DISABLED=1
ARG API_PROXY_TARGET=http://backend:8080
ENV API_PROXY_TARGET=${API_PROXY_TARGET}
ARG INTERNAL_API_URL=http://backend:8080
ENV INTERNAL_API_URL=${INTERNAL_API_URL}
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
