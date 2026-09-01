# Build context: monorepo root (Plugins/Webina) — see docker-compose.yml
FROM node:22-alpine AS deps
WORKDIR /app
COPY packages/webina-ui /packages/webina-ui
COPY WebinoDashboard/frontend/package.json WebinoDashboard/frontend/package-lock.json* ./
RUN sed -i 's|file:../../packages/webina-ui|file:/packages/webina-ui|g' package.json \
    && if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /packages/webina-ui /packages/webina-ui
COPY WebinoDashboard/frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
ARG API_PROXY_TARGET=http://backend:8080
ENV API_PROXY_TARGET=${API_PROXY_TARGET}
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
