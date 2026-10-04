# Validation et nouveautés

**Objectif.** Rien n'arrive en production sans avoir été essayé sur une copie de la production, depuis un vrai téléphone. À chaque mise à jour, les joueurs lisent ce qui a changé.

**Terminé quand** une version a suivi tout le parcours : construite une fois, essayée sur la validation avec les données de production nettoyées, promue telle quelle en production, annoncée aux joueurs par une feuille et un push.

## Décisions

| Sujet | Décision |
| --- | --- |
| Adresse | `val.jentapp.nocly.fr`, sur le même VPS |
| Données | Une copie de la production, nettoyée à chaque rafraîchissement |
| Accès | Toi seul : inscriptions fermées, comptes des autres joueurs rendus inutilisables |
| Branches | `develop` alimente la validation, `main` la production. `main` ne reçoit jamais de commit direct : elle avance seulement par fusion en avance rapide de `develop` |
| Image | La même image passe de la validation à la production, sans être reconstruite : le commit validé sur `develop` est celui qui arrive sur `main` |
| Nouveautés | Une feuille à la première ouverture après la mise à jour, et un push à tous |

## Partie A — Environnement de validation

Un commit par point.

0. **Branches et CI.** Tout se fait sur `develop`.
   - `CLAUDE.md` : on travaille sur `develop`, jamais sur `main` ; `main` n'avance que par `git merge --ff-only develop`.
   - La CI vérifie (lint, typecheck, tests, build) sur `develop`, sur `main` et sur les demandes de fusion.
   - Sur `develop` : elle publie l'image avec les étiquettes `sha-…` et `develop`.
   - Sur `main` : si l'image de ce commit existe déjà, elle ne reconstruit rien et lui ajoute seulement l'étiquette `latest`. Sinon elle échoue : un commit arrivé sur `main` sans passer par `develop` ne se déploie pas.
1. **Variable `APP_ENV`.** `production` par défaut, `validation` sur la validation. Lue à l'exécution, jamais figée dans le build.
2. **Compose paramétré.** `deploy/docker-compose.yml` sert aux deux environnements : nom du projet et port de l'app deviennent des variables, avec les valeurs actuelles par défaut. La production ne change pas de comportement.
3. **Surcharge de validation.** `deploy/validation/docker-compose.override.yml` et son `.env.example` :
   - `APP_ENV=validation`, `APP_URL=https://val.jentapp.nocly.fr`, port `3100`.
   - Un service Mailpit : la validation n'envoie jamais un vrai email. Son interface n'écoute que sur `127.0.0.1` ; on la consulte par un tunnel SSH.
   - `SETTLE_DELAY_SECONDS` transmis, pour raccourcir les essais.
   - Ses propres secrets : mot de passe de base, `BETTER_AUTH_SECRET`, paire VAPID, et un `ERROR_DSN` distinct.
4. **Inscriptions fermées.** Avec `SIGNUPS=closed`, la page d'inscription affiche « Les inscriptions sont fermées sur cet environnement. » et le serveur refuse toute création de compte.
5. **Marque visible.** En validation : un bandeau fin « VALIDATION » en haut de chaque écran, le nom « JentApp validation » dans le manifeste, et l'en-tête `X-Robots-Tag: noindex`. Impossible de la confondre avec la production, y compris une fois installée.
6. **Nettoyage.** `scripts/validation-scrub.ts`, qui refuse de tourner si `APP_ENV` n'est pas `validation` :
   - Comptes de `VALIDATION_KEEP_EMAILS` : intacts.
   - Tous les autres : email remplacé par `joueur-{n}@validation.invalid`, mot de passe supprimé. Pseudo, soldes, paris et messages restent, pour que les écrans ressemblent à la production.
   - Pour tout le monde : sessions, vérifications, abonnements push et compteurs de tentatives supprimés.
7. **Incarner un joueur.** `scripts/validation-login.ts <pseudo> <mot de passe>` donne un mot de passe à un compte nettoyé, pour reproduire ce qu'un joueur signale. Refuse de tourner hors validation.
8. **Rafraîchissement.** `deploy/validation/refresh.sh [fichier .dump]` :
   - Refuse de tourner si le `.env` cible n'a pas `APP_ENV=validation`.
   - Prend la dernière sauvegarde de production, ou celle donnée en argument. Il ne se connecte jamais à la base de production.
   - Arrête l'app de validation, recrée sa base, restaure la sauvegarde et les photos, lance le nettoyage.
   - Redémarre l'app sur l'image demandée : ses migrations s'appliquent donc à des données de production, avant la production.
   - Termine par `ledger-check`.
9. **Nginx.** `deploy/nginx/jentapp-validation.conf`, sur le modèle de la production, vers le port `3100`.
10. **Déploiement de la validation.** `deploy/validation/deploy.sh` tire l'étiquette `develop` par défaut, ou celle donnée par `JENTAPP_TAG`, redémarre, attend le healthcheck et lance `ledger-check`. C'est la commande de tous les jours ; `refresh.sh` ne sert que pour repartir d'une copie fraîche de la production.
11. **Promotion.** `deploy/promote.sh` :
   - lit l'image exacte qui tourne en validation ;
   - vérifie que l'étiquette `latest` désigne cette même image, c'est-à-dire que le commit validé a bien été fusionné dans `main`. Sinon il s'arrête en disant quoi faire ;
   - lance `deploy.sh` en production avec cette image.
     `deploy.sh` en production refuse désormais de partir sans image explicite.
12. **Marche et arrêt.** `deploy/validation/validation.sh start|stop|status`, pour libérer la mémoire quand la validation ne sert pas.
13. **Documentation.** `docs/DEPLOY.md` : installation de la validation, et la section « Publier une version » ci-dessous.

**À faire une fois sur le VPS**, détaillé dans `docs/DEPLOY.md` :

- [ ] `free -h` : la validation ajoute une app, une base et Mailpit, soit environ 500 Mo quand elle tourne.
- [ ] DNS : `val.jentapp.nocly.fr` vers le VPS, puis certificat Certbot.
- [ ] `/opt/jentapp-validation/.env` avec ses propres secrets, et `VALIDATION_KEEP_EMAILS` à ton email.
- [ ] Un second projet dans GlitchTip, « JentApp validation », pour son `ERROR_DSN`.
- [ ] Sur ton iPhone : installer la validation sur l'écran d'accueil, à côté de la production, et y activer les notifications.

## Partie B — Nouveautés

Un commit par point.

1. **Version.** `package.json` porte la version de l'app. Elle passe à `2.0.0`, la version en ligne aujourd'hui. Aide et légal l'affiche.
2. **Notes.** Un fichier par version dans `content/releases/`, par exemple `2.1.0.md` :

   ```
   date: 2026-10-10
   title: Les stickers arrivent

   - Envoie les stickers de ton iPhone dans le chat.
   - Une page de maintenance s'affiche pendant les mises à jour.
   ```

   Deux lignes d'en-tête, une ligne vide, puis une liste de 1 à 6 lignes. Lu sans nouvelle dépendance. Créer `2.0.0.md`.
3. **Garde.** Un test échoue si la version de `package.json` n'a pas son fichier de notes, ou si un fichier de notes est mal formé. Une version ne peut donc pas partir sans ses notes.
4. **Suivi de lecture.** `users.last_seen_release`. Un compte créé reçoit la version courante : pas de feuille pour un nouveau joueur.
5. **Feuille « Quoi de neuf ».** À la première page ouverte après une mise à jour, si `last_seen_release` est plus ancienne que la version courante :
   - Sur-titre « NOUVEAUTÉS · {version} », le titre, la liste.
   - Bouton primaire « Compris », qui enregistre la version comme lue.
   - Lien discret « Toutes les nouveautés ».
   - Plusieurs versions manquées : seule la dernière s'affiche.
6. **Page Nouveautés.** `/nouveautes`, depuis une ligne « Nouveautés » d'Aide et légal : toutes les versions, la plus récente d'abord.
7. **Annonce automatique.** Au démarrage de l'app, après les migrations : si la version courante est plus récente que celle notée dans `app_meta`, l'app crée une notification `release` pour chaque compte et note la version, dans une seule transaction protégée par un verrou.
   - Texte : « JentApp {version} : {titre} ». Lien : `/nouveautes`.
   - Push à tous les abonnés, quel que soit leur réglage par ligue, avec la règle habituelle : pas de push à un joueur dont l'app est ouverte.
   - Un redémarrage sans changement de version n'envoie rien.
   - Même comportement en validation : c'est là que tu vérifies la feuille et le push avant les joueurs.

**Sans maquette**, à construire avec les composants existants et à reporter dans `docs/design.md` : le bandeau de validation, la feuille « Quoi de neuf », la page Nouveautés.

## Publier une version

Section à reprendre telle quelle dans `docs/DEPLOY.md`.

| Étape | Où | Commande ou geste |
| --- | --- | --- |
| 1. Développement | Dépôt, branche `develop` | Commits, puis `git push origin develop` ; la CI publie l'image `develop` |
| 2. Essai courant | VPS, puis iPhone | `/opt/jentapp-validation/deploy.sh`, et test sur la validation. Autant de fois que nécessaire |
| 3. Numéro et notes | Dépôt, branche `develop` | Quand c'est prêt : monter la version dans `package.json`, écrire `content/releases/{version}.md`, pousser |
| 4. Répétition générale | VPS, puis iPhone | `/opt/jentapp-validation/refresh.sh` : copie fraîche de la production, migrations rejouées. La feuille « Quoi de neuf » s'affiche, le push arrive, rien d'autre n'est cassé |
| 5. Fusion | Dépôt | `git checkout main && git merge --ff-only develop && git push origin main`, puis `git checkout develop`. La CI ajoute `latest` à l'image déjà validée |
| 6. Promotion | VPS | `/opt/jentapp/promote.sh` : sauvegarde, même image, contrôle du journal |
| 7. Contrôle | iPhone | La production affiche la nouvelle version dans Aide et légal |

- Une correction urgente suit le même chemin : `develop`, validation, fusion, promotion. Rien ne s'écrit directement sur `main`.
- Si `git merge --ff-only` refuse, c'est qu'un commit est arrivé sur `main` hors parcours : le reporter sur `develop` d'abord.
- Le push part au démarrage de la production : éviter de promouvoir la nuit.
- Retour arrière : `JENTAPP_TAG=<sha précédent> /opt/jentapp/deploy.sh`, et restauration de la sauvegarde si une migration est passée.
- Numérotation : `2.x.0` pour une nouveauté visible, `2.x.y` pour une correction.

## Tests

| Sujet | Tests |
| --- | --- |
| Garde d'environnement | Nettoyage, incarnation et rafraîchissement refusent de tourner hors validation |
| Nettoyage | Les comptes gardés sont intacts. Les autres n'ont plus d'email réel ni de mot de passe et ne peuvent pas se connecter. Plus aucune session ni abonnement push. `ledger-check` passe après nettoyage |
| Inscriptions | `SIGNUPS=closed` : refus côté serveur, pas seulement à l'écran |
| CI | Sur `main`, un commit sans image existante fait échouer la publication. Sur `develop`, l'image porte `sha-…` et `develop` |
| Promotion | `promote.sh` s'arrête si `latest` ne désigne pas l'image qui tourne en validation |
| Production inchangée | Sans `APP_ENV`, ni bandeau, ni inscriptions fermées ; le compose donne le même résultat qu'avant |
| Notes | Version sans fichier : le test de garde échoue. Fichier mal formé : idem |
| Feuille | Affichée une fois par version et par compte, sur tous ses appareils. Jamais pour un compte créé après la version |
| Annonce automatique | Une notification par compte à la première montée de version, aucune au redémarrage suivant. Deux démarrages simultanés : une seule annonce |

## Critères de fin

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` et `pnpm build` passent ; la CI est verte.
- [ ] `docker compose config` passe pour la production et pour la validation, et la sortie de production est identique à celle d'avant.
- [ ] En local, avec une sauvegarde de ta base de dev : `refresh.sh` produit une validation où seul le compte gardé se connecte, et `validation-login.ts` permet d'incarner un autre joueur.
- [ ] En local : passer de `2.0.0` à une version d'essai affiche la feuille une fois, crée une notification par compte, et rien de plus au redémarrage.
- [ ] `nginx -t` valide la conf de validation.
- [ ] `docs/DEPLOY.md` contient l'installation de la validation et « Publier une version ».

## Consigne pour Claude Code

> Travaille sur la branche `develop`. Lis `CLAUDE.md`, `docs/DEPLOY.md`, `docs/ANNONCE.md` et `docs/VALIDATION.md`, puis le dossier `deploy/` et `.github/workflows/`. Implémente la partie A, en commençant par son point 0, puis la partie B, dans l'ordre, un commit par point, logique et tests avant l'interface. Tu peux modifier `deploy/`. Ne te connecte à aucun serveur et ne déploie rien. La production ne doit pas changer de comportement tant que `APP_ENV` n'est pas défini. Si un choix n'est couvert par aucun document, arrête-toi et pose la question. À la fin, coche les critères de fin et donne-moi les commandes exactes à lancer sur le VPS, dans l'ordre.