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
# Identifiant du build : la CI passe le SHA du commit. Il nomme le cache du
# service worker, qui suit ainsi le déploiement et non l'heure du build.
ARG BUILD_ID=""
ENV NEXT_TELEMETRY_DISABLED=1 \
    BUILD_ID=${BUILD_ID}
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
# Notes de version, lues à l'exécution (feuille « Quoi de neuf », page Nouveautés, annonce).
COPY --from=build --chown=nextjs:nodejs /app/content/releases ./content/releases
COPY --from=build --chown=nextjs:nodejs /app/src/db/migrations ./db/migrations
COPY --from=build --chown=nextjs:nodejs /app/src/db/migrate.ts ./db/migrate.ts
# Scripts d'administration, lancés dans le conteneur :
#   docker compose exec app node scripts/admin-grant.ts <email>
#   docker compose exec app node scripts/ledger-check.ts
#   docker compose exec app node scripts/announce.ts [--envoyer] "<message>"
#   docker compose run --rm app node scripts/validation-scrub.ts   (validation seulement)
#   docker compose exec app node scripts/validation-login.ts <pseudo> <mot de passe>   (idem)
#   docker compose exec app node scripts/stickers-gc.ts [--supprimer]
COPY --from=build --chown=nextjs:nodejs /app/scripts/admin-grant.ts /app/scripts/ledger-check.ts /app/scripts/announce.ts /app/scripts/validation-scrub.ts /app/scripts/validation-login.ts /app/scripts/stickers-gc.ts ./scripts/
COPY --from=build --chown=nextjs:nodejs /app/src/server/ledger/check.ts ./src/server/ledger/check.ts
COPY --from=build --chown=nextjs:nodejs /app/src/server/notifications/announce.ts ./src/server/notifications/announce.ts
COPY --from=build --chown=nextjs:nodejs /app/src/server/realtime/notify.ts ./src/server/realtime/notify.ts
COPY --from=build --chown=nextjs:nodejs /app/src/server/env.ts ./src/server/env.ts
COPY --from=build --chown=nextjs:nodejs /app/src/server/validation/scrub.ts /app/src/server/validation/login.ts ./src/server/validation/
COPY --from=build --chown=nextjs:nodejs /app/src/server/stickers/gc.ts ./src/server/stickers/gc.ts

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

# Migrations d'abord : en cas d'échec, le conteneur s'arrête sans démarrer l'app.
CMD ["sh", "-c", "node db/migrate.ts && exec node server.js"]
