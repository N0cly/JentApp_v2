# Nouveautés : aperçu, mise en forme et promotion

**Objectif.** Tu écris la note de version comme tu veux, tu la revois sur la validation autant de fois que nécessaire, et au moment de la mise en production tu vois exactement ce que les joueurs vont recevoir.

**Terminé quand**, sur la validation, une commande réaffiche la feuille « Quoi de neuf » et renvoie le push sur ton iPhone, et que `promote.sh` liste les nouveautés avant de déployer.

Ce document complète la partie B de `docs/VALIDATION.md`. S'il la contredit, c'est lui qui s'applique.

## Périmètre

Sur `develop`, un commit par point. Logique et tests d'abord, interface ensuite.

1. **Format enrichi des notes.** § Format.
2. **Date de mise en ligne.** § Date.
3. **Feuille cumulée.** § Feuille.
4. **Version dans `/api/health`.** La réponse ajoute `"version"`, lue dans `package.json`.
5. **Commande d'aperçu.** § Aperçu.
6. **Brouillon.** § Brouillon.
7. **Promotion.** § Promotion.
8. **Note 2.1.0.** Réécrire `content/releases/2.1.0.md` au nouveau format, § Exemple.
9. **Documentation.** `docs/DEPLOY.md`, section « Publier une version », et `docs/design.md` pour la feuille.

## Format

Un fichier par version dans `content/releases/`. En-tête, ligne vide, puis le corps.

| Champ | Obligatoire | Règle |
| --- | --- | --- |
| `title` | oui | 60 caractères au plus. Titre de la feuille |
| `push` | non | 120 caractères au plus. Texte du push et de la notification. Absent : « JentApp {version} : {title} » |
| `intro` | non | 200 caractères au plus. Une phrase sous le titre |
| `date` | non | Voir § Date |

Le corps est une liste, avec ou sans rubriques :

- Rubriques libres, toutes facultatives : une rubrique est toute ligne `## Titre`, avec un titre de 1 à 30 caractères (`## Nouveau`, `## Corrigé`, `## Soon !`…). Quatre au plus, affichées dans l'ordre du fichier.
- Une ligne `# Titre` à un seul dièse et un élément de liste vide (`-` seul) sont refusés, avec un message qui dit comment corriger.
- Sans rubrique, une simple liste : les fichiers déjà écrits restent valides.
- 12 lignes au plus en tout, 140 caractères au plus par ligne.
- Texte brut. Seul `**gras**` est interprété. À l'affichage, les textes passent par `frenchSpacing` (espace insécable devant « ? ! : ; »).

Le test de garde vérifie ces règles pour chaque fichier, et qu'un fichier existe pour la version de `package.json`.

## Date

La note n'a plus besoin de porter sa date. À la première fois qu'une version démarre dans un environnement, l'app enregistre la date dans une table `releases (version, released_at)`, dans la même transaction que l'annonce automatique. La page Nouveautés affiche cette date. Si `date` figure dans le fichier, elle l'emporte.

Conséquence : plus de commit de dernière minute le jour de la promotion.

## Feuille

- La feuille « Quoi de neuf » affiche toutes les versions que le joueur n'a pas vues, la plus récente d'abord, trois au plus. Au-delà, le lien « Toutes les nouveautés ».
- Chaque version : sur-titre « NOUVEAUTÉS · {version} », titre, intro, puis les rubriques avec leur nom en sur-titre.
- « Compris », la croix et le fond marquent tout comme lu.
- La page `/nouveautes` suit la même mise en forme.

## Aperçu

`scripts/release-preview.ts`, et le raccourci `deploy/validation/preview.sh`. Refusent de tourner hors validation.

```sh
/opt/jentapp-validation/preview.sh              # affiche la note dans le terminal, réarme la feuille
/opt/jentapp-validation/preview.sh --push       # en plus, renvoie le push
/opt/jentapp-validation/preview.sh --version 2.1.0
```

- **Terminal.** Affiche ce que verront les joueurs : version, titre, intro, rubriques, texte du push, et le nombre de caractères de chaque champ.
- **Réarmer.** Remet `last_seen_release` des comptes de `VALIDATION_KEEP_EMAILS` à la version précédente : la feuille se rouvre à la prochaine page, autant de fois qu'on relance la commande.
- **`--push`.** Recrée la notification de version pour ces seuls comptes et envoie le push, même si l'app est ouverte.
- Sans `--version`, c'est la version courante de l'image.

Boucle de travail : modifier `content/releases/{version}.md`, `git push origin develop`, attendre « VAL déployée » sur Telegram, lancer `preview.sh --push`, regarder l'iPhone.

## Brouillon

`pnpm release:draft` liste les commits depuis le dernier changement de version dans `package.json`, groupés par type (`feat`, `fix`, autres), avec leur titre. C'est une matière première pour écrire la note, pas la note : rien n'est écrit dans `content/releases/`.

## Promotion

Avant de déployer, `promote.sh` :

1. Lit la version en production (`/api/health`) et celle de l'image validée.
2. Affiche les notes de toutes les versions comprises entre les deux, telles que les joueurs les verront, et le texte du push.
3. Affiche le nombre de comptes qui recevront la notification, et combien sont abonnés au push.
4. Demande de taper le numéro de la version pour confirmer. `--oui` saute la question.
5. Si la version ne change pas, il le dit : rien ne sera annoncé.

Après le déploiement, le message Telegram devient :

```
PROD · JentApp 2.1.0 en ligne · sha-abc1234
Les stickers arrivent dans le chat
9 abonnés au push sur 14 comptes
```

## Exemple

`content/releases/2.1.0.md` :

```
title: Les stickers arrivent dans le chat
push: Les stickers sont là. Ouvre le chat pour essayer.
intro: Première mise à jour depuis le lancement, avec vos retours.

## Nouveau
- Envoie les stickers de ton iPhone dans le chat : touche-en un dans le clavier, il part avec ton message.
- Une image copiée se colle aussi dans le chat, au format sticker.
- Les nouveautés s'affichent ici à chaque mise à jour.

## Amélioré
- Une page d'attente remplace l'erreur pendant les mises à jour.
```

## Tests

| Sujet | Tests |
| --- | --- |
| Format | Fichier sans rubrique, avec rubriques, avec `push` et `intro` : acceptés. Rubriques libres dans n'importe quel ordre : acceptées. Ligne `# Titre`, élément de liste vide, cinq rubriques, titre de rubrique de 31 caractères, 13 lignes, titre de 61 caractères : refusés par le test de garde |
| Date | Enregistrée au premier démarrage d'une version, inchangée au suivant. `date` du fichier prioritaire |
| Feuille | Deux versions non vues : les deux s'affichent, la plus récente d'abord. Quatre : trois et le lien. Tout est marqué lu en une fois |
| Aperçu | Refus hors validation. Seuls les comptes gardés sont réarmés. `--push` crée une notification par compte gardé et aucune pour les autres |
| Promotion | Version inchangée : aucun affichage de note, message « rien ne sera annoncé ». Mauvais numéro saisi : arrêt sans rien déployer |
| Santé | `/api/health` renvoie la version de `package.json` |

## Critères de fin

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` et `pnpm build` passent ; la CI est verte.
- [x] En local : `release-preview.ts` réaffiche la feuille deux fois de suite pour le compte gardé.
- [ ] Sur la validation : `preview.sh --push` affiche la note dans le terminal, le push arrive sur l'iPhone, la feuille s'ouvre avec ses rubriques.
- [ ] En local, sur le compose de production : `promote.sh` liste la note, refuse un mauvais numéro, et ne déploie rien sans confirmation.
- [x] `docs/DEPLOY.md` et `docs/design.md` sont à jour.

## Consigne pour Claude Code

> Travaille sur `develop`. Lis `CLAUDE.md`, `docs/VALIDATION.md`, `docs/AUTOMATISATION.md`, `docs/DEPLOY.md` et `docs/NOUVEAUTES.md`. Implémente uniquement `docs/NOUVEAUTES.md`, dans l'ordre du périmètre, un commit par point, logique et tests avant l'interface. Tu peux modifier `deploy/`. Ne te connecte à aucun serveur et n'envoie aucun message Telegram réel. Lance `pnpm lint`, `pnpm typecheck` et `pnpm test` avant chaque fin de point. Si un choix n'est couvert par aucun document, arrête-toi et pose la question. À la fin, coche les critères vérifiables en local et donne-moi les fichiers à copier sur le VPS et les commandes à lancer.