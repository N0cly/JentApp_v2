# Mise en production

**Objectif.** JentApp tourne sur `https://jentapp.nocly.fr`, envoie ses emails, se sauvegarde, remonte ses erreurs, et la bande peut s'y inscrire.

**Terminé quand** un compte créé depuis un iPhone reçoit son email de confirmation, installe l'app, reçoit un push, et qu'une restauration de sauvegarde a été rejouée une fois.

Le travail se fait en deux temps : la partie A dans le dépôt, par Claude Code, vérifiable en local ; les parties B à D sur le VPS et sur de vrais téléphones, par toi, en suivant `docs/DEPLOY.md`.

## Décisions

| Sujet | Décision |
| --- | --- |
| Domaine | `jentapp.nocly.fr` |
| Emails | Resend, par SMTP, avec le domaine `nocly.fr` |
| Suivi d'erreurs | GlitchTip auto-hébergé sur le VPS, sur `glitchtip.nocly.fr` |
| Déploiement | Manuel : l'image est construite par la CI, tirée à la main sur le VPS |
| Instances | Une seule instance de l'app, toujours : le temps réel en dépend |

## Partie A — Dans le dépôt

Un commit par point. C'est la première fois que `deploy/` est modifié depuis M0.

1. **Variables de production.** `deploy/docker-compose.yml` transmet à l'app toutes les variables de `.env.example` qui lui manquent : `BETTER_AUTH_SECRET`, `SMTP_*`, `EMAIL_FROM`, `TRUST_PROXY`, `UPLOADS_DIR`, `GIPHY_API_KEY`, `VAPID_*`, et celles du point 3. `SETTLE_DELAY_SECONDS` n'y figure pas : le délai reste à 10 minutes. Créer `deploy/.env.example`, commenté, avec `TRUST_PROXY=true`.
2. **Scripts d'administration dans l'image.** `admin:grant` et `ledger:check` n'existent que dans le dépôt : l'image de production ne contient ni `scripts/` ni `src/`. Les rendre exécutables dans le conteneur, par exemple `docker compose exec app node scripts/admin-grant.js <email>`.
3. **Suivi d'erreurs.** GlitchTip parle le protocole de Sentry : utiliser `@sentry/nextjs`, admis en dépendance. Lire les documentations actuelles de GlitchTip et du SDK avant d'écrire.
    - `ERROR_DSN` lu à l'exécution, côté serveur, et transmis au navigateur par le layout. Jamais figé dans le build. Vide : suivi désactivé, comme en local.
    - Erreurs serveur et navigateur seulement : pas de traces de performance, pas d'enregistrement de session.
    - Aucune donnée personnelle : pas d'email, pas de cookie, pas de corps de requête. L'identifiant du joueur suffit.
    - Les interruptions de flux déjà filtrées en M7 ne remontent pas.
4. **Journaux.** Une erreur serveur s'écrit sur une ligne, en JSON, avec l'heure, la route et l'identifiant du joueur. Rotation des journaux Docker dans le compose : 10 Mo, 5 fichiers.
5. **Identifiant de build.** La CI passe `BUILD_ID` avec le SHA du commit, pour que la version du service worker suive le déploiement et non l'heure du build.
6. **Nginx.** Dans `deploy/nginx/jentapp.conf` :
    - `client_max_body_size 6m;` : sans elle, Nginx refuse toute photo de plus de 1 Mo.
    - `/sw.js` servi avec `Cache-Control: no-cache`.
    - En-têtes `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`.
7. **GlitchTip.** `deploy/glitchtip/` : son compose (web, worker, sa base, son cache), son `.env.example` et sa conf Nginx pour `glitchtip.nocly.fr`. Inscription fermée après la création du premier compte.
8. **Sauvegarde.** `deploy/backup/backup.sh` :
    - `pg_dump` au format compressé de la base, plus une archive du volume `uploads`.
    - Écrit dans `/var/backups/jentapp/`, un fichier daté par jour, 14 jours gardés.
    - Sort en erreur si le fichier produit est vide.
    - `deploy/backup/restore.sh` restaure un fichier donné dans une base vide.
    - Planification par un timer systemd, fourni dans le même dossier.
9. **Script de déploiement.** `deploy/deploy.sh` : sauvegarde, `docker compose pull`, `docker compose up -d`, attente du healthcheck, puis `ledger:check`. S'arrête à la première erreur. Retour arrière : relancer avec `JENTAPP_TAG=<sha précédent>` ; une migration ne se défait pas, d'où la sauvegarde d'abord.
10. **Textes légaux.** Remplacer les crochets de `content/legal/*.md` avec les informations du § Ce qu'il me faut. Ajouter à la politique de confidentialité les sous-traitants réels : Resend (emails), Giphy (GIF), services de push d'Apple, Google et Mozilla, et le suivi d'erreurs hébergé sur le VPS.
11. **`docs/DEPLOY.md`.** Le réécrire pour qu'il déroule la partie B, commande par commande, y compris GlitchTip, la sauvegarde, la restauration et le retour arrière.

**Critères de la partie A**

- [ ] `docker compose -f deploy/docker-compose.yml config` passe avec `deploy/.env.example`.
- [ ] En local, dans l'image de production : `admin:grant` et `ledger:check` s'exécutent dans le conteneur.
- [ ] En local : une erreur provoquée arrive dans un GlitchTip lancé depuis `deploy/glitchtip/`, sans email ni cookie dans l'événement.
- [ ] En local : `backup.sh` produit un fichier, `restore.sh` le restaure dans une base vide, et `ledger:check` passe sur la base restaurée.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` et `pnpm build` passent ; la CI est verte.

## Partie B — Sur le VPS

Dans l'ordre. Le détail des commandes est dans `docs/DEPLOY.md` une fois la partie A terminée.

**Avant de commencer**

- [ ] `free -h` : GlitchTip ajoute une base, un cache et deux processus, soit environ 1 Go de mémoire, sur une machine qui héberge déjà d'autres services. S'il n'y a pas la place, passer à Sentry en ligne ne demande que de changer `ERROR_DSN`.

**DNS**

- [ ] Enregistrement A `jentapp.nocly.fr` vers le VPS.
- [ ] Enregistrement A `glitchtip.nocly.fr` vers le VPS.
- [ ] Dans Resend : domaine `nocly.fr` vérifié, avec ses enregistrements SPF et DKIM. Ajouter un enregistrement DMARC s'il n'existe pas.

**Secrets**, dans `/opt/jentapp/.env`, lisible par toi seul :

- [ ] `POSTGRES_PASSWORD` : nouveau, alphanumérique.
- [ ] `BETTER_AUTH_SECRET` : `openssl rand -base64 32`.
- [ ] `VAPID_*` : une paire neuve par `pnpm vapid:generate`, pas celle de ton poste. Elle ne doit plus jamais changer : la remplacer désabonne tous les téléphones.
- [ ] `SMTP_HOST=smtp.resend.com`, `SMTP_USER=resend`, `SMTP_PASSWORD` : une clé d'API Resend. Port et chiffrement : ceux de la documentation Resend.
- [ ] `EMAIL_FROM="JentApp <no-reply@nocly.fr>"`.
- [ ] `GIPHY_API_KEY` : une clé de production.
- [ ] `APP_URL=https://jentapp.nocly.fr`, `TRUST_PROXY=true`.

**Lancement**

- [ ] GlitchTip d'abord : compose, certificat, premier compte, inscription fermée, projet « JentApp », DSN copié dans `ERROR_DSN`.
- [ ] Accès à l'image : `docker login ghcr.io` avec un jeton `read:packages`, ou paquet rendu public.
- [ ] Certificat Certbot pour `jentapp.nocly.fr`, puis conf Nginx.
- [ ] `deploy.sh`, puis `curl https://jentapp.nocly.fr/api/health` renvoie `{"status":"ok","db":"ok"}`.
- [ ] Pare-feu : seuls 80 et 443 sont ouverts ; le port de Postgres n'est pas publié.

**Vérifications**

- [ ] Redémarrage du VPS : l'app et la base repartent seules, les données sont là.
- [ ] Timer de sauvegarde actif ; un fichier apparaît dans `/var/backups/jentapp/`, dossier couvert par ta sauvegarde hors site.
- [ ] Restauration rejouée une fois sur une base de test.
- [ ] Une erreur provoquée arrive dans GlitchTip.
- [ ] Entrée ajoutée au dashboard Homepage, à partir de `deploy/homepage/services.yaml`.

## Partie C — Sur de vrais téléphones

Sur ton iPhone, et sur un Android emprunté.

- [ ] Inscription : l'email de confirmation arrive dans la boîte de réception, pas dans les indésirables.
- [ ] Mot de passe oublié : l'email arrive, le lien marche.
- [ ] Installation sur l'écran d'accueil, iPhone et Android ; l'app s'ouvre en plein écran.
- [ ] Push sur iPhone, app installée et fermée : la notification arrive et ouvre le bon pari.
- [ ] Push sur Android.
- [ ] Zones sûres : bouton du bas hors de l'indicateur d'accueil, en-tête sous la barre d'état.
- [ ] Clavier : la saisie du chat et le bouton d'un formulaire restent visibles.
- [ ] Taille du texte agrandie dans les réglages du système : rien ne se chevauche.
- [ ] Rotation du téléphone, app installée.
- [ ] Défilement au doigt des feuilles longues : ticket de mise, tournée, GIF.
- [ ] Une soirée complète à deux téléphones : pari créé, mises, résultat, versement en direct, chat, GIF.

## Partie D — Ouverture

- [ ] Créer ton compte, puis `admin:grant` pour devenir super-admin.
- [ ] Ajouter les premiers avatars au catalogue, si tu en as.
- [ ] Créer la ligue de la bande et partager le lien d'invitation.
- [ ] Prévenir la bande, message ci-dessous.
- [ ] Une semaine plus tard : `ledger:check` sans écart, GlitchTip relu, une sauvegarde vérifiée.
- [ ] Éteindre la v1 : projet Vercel supprimé, projet Supabase mis en pause puis supprimé, dépôt `JentApp` archivé.

**Message à la bande**

```
JentApp repart de zéro, en mieux : https://jentapp.nocly.fr

Il faut recréer ton compte, les anciens ne sont pas repris et tout le monde redémarre à 50 clopes.
Une fois inscrit, rejoins la ligue avec ce lien : {lien d'invitation}

Sur iPhone : ouvre le lien dans Safari, puis Partager > Sur l'écran d'accueil, pour recevoir les notifications.
L'ancienne app s'arrête le {date}.
```

## Ce qu'il me faut

Pour le point 10 de la partie A, avant de lancer Claude Code :

- Le nom de l'éditeur à afficher dans les mentions légales, et une adresse de contact.
- Le nom et l'adresse de l'hébergeur du VPS.
- La date d'entrée en vigueur des conditions.

Les textes légaux restent des brouillons : une relecture par un juriste est conseillée avant d'ouvrir au-delà de la bande.

## Consigne pour Claude Code

> Lis `CLAUDE.md`, `docs/PROD.md`, `docs/DEPLOY.md` et le dossier `deploy/`. Implémente uniquement la partie A, dans l'ordre, un commit par point. Lis les documentations actuelles de GlitchTip, de `@sentry/nextjs` et de Resend avant de les utiliser. Tu peux modifier `deploy/` : c'est l'objet de ce document. Ne te connecte à aucun serveur et ne déploie rien. Pour le point 10, utilise les informations que je te donne ; s'il en manque, laisse le crochet et signale-le. Si un choix n'est couvert par aucun document, arrête-toi et pose la question. À la fin, coche les critères de la partie A et donne-moi la liste des secrets à créer sur le VPS.