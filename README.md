# JentApp

Carnet de paris entre potes, en PWA. Les clopes sont fictives et n'ont aucune valeur réelle.

Produit : `docs/spec.md`. Règles du dépôt : `CLAUDE.md`. Déploiement : `docs/DEPLOY.md`.

## Lancer en local

Prérequis : Node 24, pnpm (via `corepack enable`), Docker.

```sh
cp .env.example .env
pnpm install
docker compose up -d db     # Postgres sur 127.0.0.1:5432
pnpm db:migrate
pnpm dev                    # http://localhost:3000, le kit sur /kit
```

Tout en conteneurs, comme en production : `docker compose up --build`, puis http://localhost:3000. Les migrations s'appliquent au démarrage de `app`.

## Tests

```sh
docker compose up -d db     # les tests d'intégration parlent à ce Postgres
pnpm test
```

Avant de pousser : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Jetons

Après une modification de `design/tokens.json` : `pnpm tokens`, qui régénère `src/app/tokens.css`.
