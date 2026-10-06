# Bugs hors périmètre

Notés en cours de jalon, sans le bloquer (`CLAUDE.md`, § Conventions).

## Zone d'appui d'une bulle de chat d'une ligne

- **Constaté** le 5 octobre 2026, pendant `docs/STICKERS.md`, avec `pnpm test:screens` sur un message court.
- **Quoi.** Une bulle de texte d'une seule ligne fait 37 px de haut (`py-2` et une ligne de 21 px). Le contrôle des zones d'appui de `pnpm test:screens` demande 44 px : « <button> « avec du texte » 126×37 ».
- **Pourquoi il n'apparaissait pas.** Le jeu de données extrême n'a que des messages de 500 caractères, donc des bulles de plusieurs lignes.
- **Piste.** Donner à la bulle une zone d'appui transparente de 44 px, comme l'avatar de 32 px du chat (`docs/design.md`, § Zones d'appui), et ajouter un message court au jeu de données extrême.

## Avertissement Edge au build sur `error-log.ts`

- **Constaté** le 6 octobre 2026, en ajoutant `pnpm build` à `pnpm check`. Présent avant ce changement ; le build sort avec le code 0.
- **Quoi.** `pnpm build` affiche : « A Node.js API is used (process.stderr at line: 33) which is not supported in the Edge Runtime », sur `src/server/logging/error-log.ts:33`, avec deux chemins d'import : « Edge Instrumentation » et « Instrumentation », tous deux depuis `src/instrumentation.ts`.
- **Pourquoi.** `onRequestError` charge `@/server/logging/error-log` par un import dynamique, mais sans condition sur le runtime. Turbopack l'inclut donc aussi dans l'instrumentation Edge, où `process.stderr` n'existe pas. `register` a déjà la garde `NEXT_RUNTIME !== "nodejs"`, pas `onRequestError`.
- **Piste.** Dans `src/instrumentation.ts`, ne charger `error-log.ts` que dans le runtime Node : faire l'import dynamique sous `process.env.NEXT_RUNTIME === "nodejs"` dans `onRequestError`. Vérifier ensuite que l'avertissement a disparu de `pnpm build`, qu'une erreur de rendu écrit toujours sa ligne JSON dans le journal, et décider si les erreurs du runtime Edge (le proxy) doivent rester sans ligne de journal, `Sentry.captureRequestError` continuant de les remonter.
