# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# Dépendances
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Exécution, en utilisateur non root
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs \
    && mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/src/db/migrations ./db/migrations
COPY --from=build --chown=nextjs:nodejs /app/src/db/migrate.ts ./db/migrate.ts

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

# Migrations d'abord : en cas d'échec, le conteneur s'arrête sans démarrer l'app.
CMD ["sh", "-c", "node db/migrate.ts && exec node server.js"]
