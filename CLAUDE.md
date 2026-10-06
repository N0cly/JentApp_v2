# JentApp v2

Carnet de paris entre potes, en PWA : on mise des clopes fictives sur ce qui va se passer, par ligue privée, en pari mutuel.

Réécriture complète de la v1 (`N0cly/JentApp`, React Native + Supabase). Rien n'est repris du code ni des données de la v1, seulement le produit.

## Documents de référence

- `docs/spec.md` : spec fonctionnelle et logique. C'est la source de vérité produit.
- `docs/M0.md`, `docs/M1.md`… : un fichier par jalon. On ne code que le jalon en cours.
- `docs/design.md` : comment appliquer la maquette (jetons, composants, écrans, routes).
- `design/tokens.json` : jetons du design system (couleurs, typo, espacements, rayons).
- `design/screens/*.html` : pages de référence des écrans. Elles font foi pour l'apparence.
- `design/icon/` : icône de l'app.
- `content/legal/*.md` : texte des pages légales.

## Stack

- Next.js (App Router), TypeScript strict, pnpm.
- Postgres + Drizzle. Schéma, migrations et client dans `src/db`.
- Better Auth à partir de M1, sessions en base, cookie `httpOnly`.
- Tailwind CSS, avec les jetons exposés en variables CSS.
- Vitest pour les tests.
- Docker Compose sur un VPS, derrière Nginx. Une seule instance de l'app.

## Règles non négociables

1. **L'argent ne s'écrit que côté serveur.** Aucun composant client ne calcule ni n'écrit un solde, une mise, un gain ou un rôle.
2. **Un seul chemin pour les clopes.** Tout mouvement passe par le module `src/server/ledger` : une ligne de journal et la mise à jour du solde, dans la même transaction. Aucun autre code ne modifie `league_members.balance`.
3. **Appartenance vérifiée.** Toute lecture ou écriture liée à une ligue vérifie d'abord, côté serveur, que l'utilisateur en est membre et a le rôle requis.
4. **Des entiers.** Soldes et mises sont des entiers en clopes. Jamais de flottant pour l'argent ; les arrondis du règlement suivent `docs/spec.md` §5.
5. **Pas de fuite de compte.** Aucun email ni donnée de compte dans ce qui est renvoyé aux autres joueurs.
6. **Pas de secret dans le dépôt.** `.env` est ignoré ; `.env.example` documente chaque variable.
7. **Pas de tâche planifiée.** L'état d'un pari et l'allocation hebdomadaire se calculent à la lecture (spec §4 et §5).
8. **Les clopes n'ont aucune valeur réelle.** Ni achat, ni vente, ni conversion, ni lot. Ne jamais ajouter de paiement ou d'échange (spec §15).

## Interface

- L'apparence suit `design/screens`. Un écran sans page de référence ne s'invente pas : s'arrêter et demander.
- Aucune couleur, aucun rayon, aucun espacement en dur : uniquement les variables issues de `design/tokens.json`.
- Les composants de base vivent dans `src/components/ui` et portent les noms de `docs/design.md`.
- Pas d'emoji, pas d'ombre, pas de dégradé, pas de bibliothèque de composants tierce.
- Le papier (`paper`) est réservé au composant `Ticket`.
- Les pseudos, questions et montants des pages de référence sont des exemples, jamais des valeurs à coder en dur.

## Conventions

- Code, identifiants, tables et commits en anglais. Textes d'interface en français, tutoiement, sans emoji.
- Unités : clope, joint (5 clopes), paquet (20 clopes). Un solde s'affiche toujours en clopes.
- Commits atomiques, format conventionnel (`feat:`, `fix:`, `chore:`…).
- On travaille sur `develop`, jamais sur `main`. `main` n'avance que par `git merge --ff-only develop` : le commit validé sur `develop` est celui qui part en production.
- Une fonctionnalité se construit dans cet ordre : logique serveur et ses tests, puis interface.
- Un bug hors périmètre du jalon se note dans `docs/BUGS.md` ; il ne bloque pas le jalon.
- Avant chaque fin de tâche, `pnpm check` doit passer : il enchaîne les vérifications de la CI. Pas une sélection de commandes à la place.

## Structure

```
src/app/            routes et pages (App Router)
src/components/ui/  composants de base du design system
src/components/     composants d'écran
src/server/         logique métier, jamais importée côté client
src/db/             schéma Drizzle, migrations, client
src/lib/            utilitaires partagés
design/tokens.json  jetons du design system
design/screens/     pages HTML de référence des écrans
docs/               spec et jalons
deploy/             compose de production, configuration Nginx
```

## Commandes

```
pnpm dev            serveur de développement
pnpm lint           ESLint
pnpm typecheck      tsc --noEmit
pnpm test           Vitest
pnpm check          lint, format:check, typecheck et test, arrêt à la première erreur
pnpm db:generate    génère une migration à partir du schéma
pnpm db:migrate     applique les migrations
docker compose up   app + Postgres en local
```

## À ne pas faire

- Reprendre du code de la v1.
- Ajouter une dépendance sans que le jalon en donne la raison.
- Ajouter un service de plus (Redis, file de messages, serveur WebSocket) : SSE et `LISTEN/NOTIFY` suffisent.
- Stocker l'état d'un pari : il se déduit de ses dates.
- Anticiper un jalon suivant.

## Jalon en cours

M7 — Notifications, journal et PWA (`docs/M7.md`). Mettre cette section à jour à chaque changement de jalon.
