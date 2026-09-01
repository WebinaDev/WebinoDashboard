# Build context: WebinoDashboard repo root (self-contained, includes packages/webina-ui)
FROM node:22-alpine AS deps
WORKDIR /src
COPY packages/webina-ui ./packages/webina-ui
COPY frontend/package.json ./frontend/package.json
WORKDIR /src/frontend
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /src
COPY --from=deps /src/frontend/node_modules ./frontend/node_modules
COPY packages/webina-ui ./packages/webina-ui
COPY frontend ./frontend
WORKDIR /src/frontend
ENV NEXT_TELEMETRY_DISABLED=1
ARG API_PROXY_TARGET=http://backend:8080
ENV API_PROXY_TARGET=${API_PROXY_TARGET}
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /src/frontend/public ./public
COPY --from=builder --chown=nextjs:nodejs /src/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /src/frontend/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
