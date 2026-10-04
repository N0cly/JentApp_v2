# Déploiement

Ce document déroule la partie B de `docs/PROD.md`, commande par commande. Il suppose un VPS avec Docker et son plugin Compose, Nginx et Certbot, et un accès SSH. Les commandes `sudo` demandent ton mot de passe ; rien ne se fait depuis le dépôt sans ton action.

| Où | Quoi |
| --- | --- |
| `/opt/jentapp/` | `docker-compose.yml`, `.env`, `deploy.sh`, `promote.sh`, `announce.sh`, `backup/` |
| `/opt/jentapp-validation/` | `docker-compose.yml`, `docker-compose.override.yml`, `.env`, `refresh.sh`, `validation.sh` (étape 16) |
| `/opt/glitchtip/` | `docker-compose.yml`, `.env` |
| `/etc/nginx/sites-available/` | `jentapp.conf`, `jentapp-validation.conf`, `glitchtip.conf` |
| `/var/www/jentapp/` | `maintenance.html`, servie quand l'app ne répond pas |
| `/etc/systemd/system/` | `jentapp-backup.service`, `jentapp-backup.timer` |
| `/var/backups/jentapp/` | Sauvegardes, 14 jours |

L'image est construite par la CI et publiée sur `ghcr.io/n0cly/jentapp_v2` à chaque push sur `develop`, étiquetée `develop` et `sha-<commit court>`. Un push sur `main` ne reconstruit rien : la CI ajoute l'étiquette `latest` à l'image déjà construite pour ce commit, et échoue s'il n'y en a pas (commit arrivé sur `main` sans passer par `develop`). La production ne déploie jamais `latest` : une version passe d'abord par la validation, puis la même image part en production (« Publier une version »).

Dans les commandes, `<vps>` est ton hôte SSH (par exemple `nocly@1.2.3.4`).

## 0. Avant de commencer

```sh
free -h          # GlitchTip demande environ 1 Go de mémoire en plus
docker compose version
sudo systemctl enable docker
```

S'il n'y a pas la place pour GlitchTip, saute l'étape 3 et mets dans `ERROR_DSN` le DSN d'un projet Sentry en ligne : rien d'autre ne change.

Les ports `3000` (app) et `8000` (GlitchTip) doivent être libres en local sur le VPS : `sudo ss -ltnp | grep -E ':(3000|8000) '` ne doit rien afficher. S'ils sont pris, change le port hôte dans le compose concerné et dans sa conf Nginx.

## 1. DNS et Resend

- Enregistrement `A` (et `AAAA` en IPv6) de `jentapp.nocly.fr` vers le VPS.
- Enregistrement `A` (et `AAAA`) de `glitchtip.nocly.fr` vers le VPS.
- Dans Resend, ajouter le domaine `nocly.fr` et créer chez ton registraire les enregistrements SPF et DKIM qu'il affiche. Attendre « Verified ».
- Si `nocly.fr` n'a pas d'enregistrement DMARC : `TXT` sur `_dmarc.nocly.fr`, valeur `v=DMARC1; p=none; rua=mailto:<ton adresse>`.
- Créer deux clés d'API Resend, droit « Sending access » : une pour l'app, une pour GlitchTip.

Vérifier depuis ton poste :

```sh
dig +short jentapp.nocly.fr glitchtip.nocly.fr
```

## 2. Copier les fichiers

Depuis ton poste, à la racine du dépôt :

```sh
ssh <vps> 'sudo mkdir -p /opt/jentapp/backup /opt/glitchtip && sudo chown -R "$USER" /opt/jentapp /opt/glitchtip'
scp deploy/docker-compose.yml deploy/.env.example deploy/deploy.sh deploy/promote.sh deploy/announce.sh <vps>:/opt/jentapp/
scp deploy/backup/* <vps>:/opt/jentapp/backup/
scp deploy/glitchtip/docker-compose.yml deploy/glitchtip/.env.example <vps>:/opt/glitchtip/
scp deploy/nginx/jentapp.conf deploy/nginx/glitchtip.conf deploy/nginx/maintenance.html <vps>:/tmp/
ssh <vps> 'chmod +x /opt/jentapp/deploy.sh /opt/jentapp/promote.sh /opt/jentapp/announce.sh /opt/jentapp/backup/*.sh'
```

## 3. GlitchTip

### 3.1 Secrets

```sh
cd /opt/glitchtip
cp .env.example .env && chmod 600 .env
openssl rand -hex 32          # → SECRET_KEY
openssl rand -hex 24          # → POSTGRES_PASSWORD
nano .env
```

Remplir `POSTGRES_PASSWORD`, `SECRET_KEY` et, dans `EMAIL_URL`, la clé d'API Resend de GlitchTip à la place de `<clé-api-resend>`.

### 3.2 Lancement

```sh
docker compose up -d
docker compose ps             # postgres, valkey et web « running »
curl -sI http://127.0.0.1:8000/ | head -1
```

Les migrations de GlitchTip s'appliquent au démarrage.

### 3.3 Certificat et Nginx

Servir d'abord le défi ACME en HTTP :

```sh
sudo mkdir -p /var/www/certbot
sudo tee /etc/nginx/sites-available/glitchtip.conf >/dev/null <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name glitchtip.nocly.fr;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/glitchtip.conf /etc/nginx/sites-enabled/glitchtip.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d glitchtip.nocly.fr
```

Puis la conf complète :

```sh
sudo cp /tmp/glitchtip.conf /etc/nginx/sites-available/glitchtip.conf
sudo nginx -t && sudo systemctl reload nginx
```

Les fichiers `options-ssl-nginx.conf` et `ssl-dhparams.pem` sont installés par le paquet Certbot pour Nginx. S'ils manquent, retirer les lignes `include` et `ssl_dhparam`.

### 3.4 Premier compte et projet

1. Ouvrir `https://glitchtip.nocly.fr` et créer ton compte. C'est le seul qui puisse s'inscrire : `ENABLE_USER_REGISTRATION` vaut `False`, ce qui ferme l'inscription dès qu'un compte existe.
2. Créer l'organisation « Nocly », puis le projet « JentApp », plateforme Next.js. Le premier compte est administrateur et peut créer l'organisation ; si GlitchTip la refuse, passer `ENABLE_ORGANIZATION_CREATION` à `"True"` dans le compose, `docker compose up -d`, créer l'organisation, puis remettre `"False"`.
3. Dans les réglages du projet, « Client Keys (DSN) » : copier le DSN. Il ira dans `ERROR_DSN` à l'étape 4.
4. Vérifier que l'inscription est fermée : en navigation privée, la page d'inscription doit refuser un nouveau compte.

## 4. Secrets de l'app

Sur ton poste, générer une paire VAPID neuve :

```sh
pnpm vapid:generate
```

Elle ne doit plus jamais changer : la remplacer désabonne tous les téléphones. Garde-la aussi dans ton gestionnaire de mots de passe.

Sur le VPS :

```sh
cd /opt/jentapp
cp .env.example .env && chmod 600 .env
openssl rand -hex 24          # → POSTGRES_PASSWORD
openssl rand -base64 32       # → BETTER_AUTH_SECRET
nano .env
```

| Variable | Valeur |
| --- | --- |
| `POSTGRES_PASSWORD` | Le mot de passe généré |
| `BETTER_AUTH_SECRET` | Le secret généré |
| `SMTP_PASSWORD` | La clé d'API Resend de l'app |
| `GIPHY_API_KEY` | Une clé Giphy de production |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | La paire générée |
| `VAPID_SUBJECT` | `mailto:<adresse de contact>` |
| `ERROR_DSN` | Le DSN de GlitchTip |

`APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `EMAIL_FROM` et `TRUST_PROXY` ont déjà leur valeur de production. `DATABASE_URL` est construite par le compose. Le délai de versement reste à 10 minutes : il n'est pas réglable en production.

Vérifier que le compose lit tout :

```sh
docker compose config >/dev/null && echo ok
```

## 5. Accès à l'image

Si le paquet GHCR est privé, se connecter une fois avec un jeton GitHub qui a le droit `read:packages` :

```sh
echo "<jeton>" | docker login ghcr.io -u N0cly --password-stdin
```

Sinon, rendre le paquet public dans les réglages du paquet sur GitHub.

## 6. Certificat et Nginx de l'app

```sh
sudo tee /etc/nginx/sites-available/jentapp.conf >/dev/null <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name jentapp.nocly.fr;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/jentapp.conf /etc/nginx/sites-enabled/jentapp.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d jentapp.nocly.fr

sudo install -D -m 644 /tmp/maintenance.html /var/www/jentapp/maintenance.html
sudo cp /tmp/jentapp.conf /etc/nginx/sites-available/jentapp.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run
```

La conf autorise les envois jusqu'à 6 Mo (photos), sert `/sw.js` sans cache et ajoute les en-têtes de sécurité. Quand l'app ne répond pas (502, 503, 504), par exemple pendant qu'un déploiement redémarre le conteneur, Nginx sert `/var/www/jentapp/maintenance.html` : « JentApp revient dans un instant. » Les erreurs renvoyées par l'app elle-même passent telles quelles.

Vérifier la page, après le premier déploiement : dans `/opt/jentapp`, `docker compose stop app`, ouvrir `https://jentapp.nocly.fr`, puis `docker compose start app`.

## 7. Premier déploiement

L'étiquette `sha-<commit court>` de la dernière image est visible sur la page du paquet GHCR et dans l'onglet Actions de GitHub.

```sh
cd /opt/jentapp
JENTAPP_TAG=sha-abc1234 ./deploy.sh
curl -s https://jentapp.nocly.fr/api/health
# {"status":"ok","db":"ok"}
```

`deploy.sh` refuse de partir sans étiquette explicite, et jamais avec `latest`. Il enchaîne la sauvegarde (sautée au premier lancement, la base n'existant pas encore), `docker compose pull`, `docker compose up -d`, l'attente du healthcheck et `ledger-check`. Il s'arrête à la première erreur et affiche les derniers journaux de l'app si elle ne démarre pas. Une fois l'app saine, il note l'étiquette dans `.env` (`JENTAPP_TAG`), pour que la sauvegarde et toute commande `docker compose` suivante gardent la même image. Les migrations s'appliquent au démarrage du conteneur.

## 8. Pare-feu

Seuls SSH, 80 et 443 restent ouverts ; Postgres et les ports 3000 et 8000 ne sont publiés que sur `127.0.0.1`.

```sh
sudo ufw allow OpenSSH        # avant tout, pour ne pas perdre la main
sudo ufw allow 80,443/tcp
sudo ufw enable
sudo ufw status
sudo ss -ltnp | grep -E ':(5432|3000|8000) '   # 127.0.0.1 seulement, jamais 0.0.0.0
```

Docker contourne `ufw` pour les ports publiés : c'est pourquoi les composes ne publient que sur `127.0.0.1`.

## 9. Sauvegarde

```sh
sudo cp /opt/jentapp/backup/jentapp-backup.service /opt/jentapp/backup/jentapp-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jentapp-backup.timer
systemctl list-timers jentapp-backup.timer

# Une première sauvegarde tout de suite :
sudo systemctl start jentapp-backup.service
journalctl -u jentapp-backup.service -n 20
sudo ls -l /var/backups/jentapp/
```

Chaque nuit vers 3 h 30 : `jentapp-AAAA-MM-JJ.dump` (base, format compressé de `pg_dump`) et `uploads-AAAA-MM-JJ.tar.gz` (photos et avatars), lisibles par root seul, gardés 14 jours. Le script échoue si un fichier est vide. Ajoute `/var/backups/jentapp/` à la sauvegarde hors site du VPS.

## 10. Restauration

Une fois avant l'ouverture, sur une base de test : la restauration refuse une base qui a déjà des tables.

```sh
cd /opt/jentapp
sudo ./backup/restore.sh /var/backups/jentapp/jentapp-AAAA-MM-JJ.dump jentapp_restore
docker compose exec -T -e DATABASE_URL="postgres://jentapp:<POSTGRES_PASSWORD>@db:5432/jentapp_restore" \
  app node scripts/ledger-check.ts
# Journal conforme : aucun écart.
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" jentapp_restore'
```

Restauration réelle, après une perte de données :

```sh
cd /opt/jentapp
docker compose stop app
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
sudo ./backup/restore.sh /var/backups/jentapp/jentapp-AAAA-MM-JJ.dump jentapp \
  /var/backups/jentapp/uploads-AAAA-MM-JJ.tar.gz
docker compose start app
docker compose exec -T app node scripts/ledger-check.ts
```

## 11. Mise à jour et retour arrière

Une mise à jour suit « Publier une version » : validation d'abord, puis `promote.sh`.

Revenir à une version précise :

```sh
JENTAPP_TAG=sha-abc1234 /opt/jentapp/deploy.sh
```

Une migration ne se défait pas. Si la version abandonnée avait migré la base, restaurer d'abord la sauvegarde faite par `deploy.sh` juste avant (étape 10, restauration réelle), puis relancer avec `JENTAPP_TAG`.

## 12. Administration

```sh
cd /opt/jentapp
docker compose exec app node scripts/admin-grant.ts <email>    # super-admin
docker compose exec app node scripts/ledger-check.ts           # contrôle du journal
```

### Annonce à tous les joueurs

Maintenance, nouveauté, coupure : le message arrive dans le centre de notifications de tous les comptes non supprimés, quel que soit leur niveau de notifications, et en push chez ceux dont l'app est fermée. Titre « JentApp », lien vers `/notifications`. De 1 à 200 caractères.

```sh
# Aperçu : affiche le message et le nombre de destinataires, n'envoie rien.
/opt/jentapp/announce.sh "Maintenance ce soir à 23 h, coupure de 10 minutes."

# Envoi.
/opt/jentapp/announce.sh --envoyer "Maintenance ce soir à 23 h, coupure de 10 minutes."
# Annonce envoyée à 12 comptes, dont 7 abonnés au push.
```

Le raccourci lance `docker compose exec -T app node scripts/announce.ts` dans `/opt/jentapp`. L'app doit tourner : c'est elle qui envoie le push. Une annonce envoyée ne se retire pas ; elle disparaît avec les autres notifications au bout de 30 jours.

Installé avant l'arrivée de l'annonce ? Depuis ton poste :

```sh
scp deploy/announce.sh <vps>:/opt/jentapp/
ssh <vps> 'chmod +x /opt/jentapp/announce.sh'
```

## 13. Journaux

```sh
docker compose logs -f app          # une ligne JSON par erreur : heure, route, joueur
docker compose logs --since 1h app
docker compose logs -f db
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

Docker garde 5 fichiers de 10 Mo par service. Les erreurs remontent aussi dans GlitchTip.

Vérifier le suivi d'erreurs : sur `https://jentapp.nocly.fr`, connecté, ouvrir la console du navigateur et lancer `setTimeout(() => { throw new Error("Test GlitchTip") })`. L'erreur apparaît dans le projet JentApp, sans email ni cookie.

## 14. Redémarrage

Tous les services sont en `restart: unless-stopped`, les données vivent dans des volumes Docker.

```sh
cd /opt/jentapp
docker compose exec db psql -U jentapp -d jentapp \
  -c "insert into app_meta values ('reboot-check', now()::text) on conflict (key) do update set value = excluded.value"
sudo reboot
# après le redémarrage
docker compose ps
docker compose exec db psql -U jentapp -d jentapp -c "select * from app_meta"
curl -s https://jentapp.nocly.fr/api/health
(cd /opt/glitchtip && docker compose ps)
```

## 15. Dashboard Homepage

Fusionner `deploy/homepage/services.yaml` dans `config/services.yaml` de Homepage, en adaptant le groupe et `server` (le nom de l'hôte Docker déclaré dans `config/docker.yaml`). La tuile affiche l'état du conteneur `jentapp-app-1` et le temps de réponse de `/api/health`.

## 16. Validation

Une copie de la production sur `val.jentapp.nocly.fr`, sur le même VPS, pour essayer chaque version depuis ton iPhone avant les joueurs (`docs/VALIDATION.md`). Elle a sa propre base, ses propres secrets, ses inscriptions fermées, et n'envoie jamais un vrai email : tout part dans Mailpit.

### 16.1 Mémoire

```sh
free -h          # la validation ajoute une app, une base et Mailpit : environ 500 Mo quand elle tourne
```

Les ports `3100` (app) et `8025` (Mailpit) doivent être libres : `sudo ss -ltnp | grep -E ':(3100|8025) '` ne doit rien afficher.

### 16.2 DNS, GlitchTip et VAPID

- Enregistrement `A` (et `AAAA`) de `val.jentapp.nocly.fr` vers le VPS. Vérifier : `dig +short val.jentapp.nocly.fr`.
- Dans GlitchTip, un second projet « JentApp validation », plateforme Next.js : copier son DSN.
- Sur ton poste, une paire VAPID propre à la validation : `pnpm vapid:generate`.

### 16.3 Copier les fichiers

Depuis ton poste, à la racine du dépôt :

```sh
ssh <vps> 'sudo mkdir -p /opt/jentapp-validation && sudo chown -R "$USER" /opt/jentapp-validation'
scp deploy/docker-compose.yml deploy/validation/docker-compose.override.yml \
  deploy/validation/.env.example deploy/validation/refresh.sh deploy/validation/validation.sh \
  <vps>:/opt/jentapp-validation/
scp deploy/promote.sh deploy/deploy.sh <vps>:/opt/jentapp/
scp deploy/nginx/jentapp-validation.conf <vps>:/tmp/
ssh <vps> 'chmod +x /opt/jentapp-validation/*.sh /opt/jentapp/promote.sh /opt/jentapp/deploy.sh'
```

`docker-compose.yml` est le même fichier que celui de la production : `docker-compose.override.yml`, lu automatiquement à côté, y ajoute la validation.

### 16.4 Secrets

```sh
cd /opt/jentapp-validation
cp .env.example .env && chmod 600 .env
openssl rand -hex 24          # → POSTGRES_PASSWORD
openssl rand -base64 32       # → BETTER_AUTH_SECRET
nano .env
```

| Variable | Valeur |
| --- | --- |
| `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` | Les valeurs générées, jamais celles de la production |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | La paire de la validation |
| `VAPID_SUBJECT` | `mailto:<adresse de contact>` |
| `ERROR_DSN` | Le DSN de « JentApp validation » |
| `VALIDATION_KEEP_EMAILS` | Ton email de connexion à JentApp |

`APP_ENV=validation`, `JENTAPP_PROJECT=jentapp-validation`, `JENTAPP_PORT=3100` et `APP_URL` ont déjà leur valeur. `JENTAPP_TAG` reste vide : `refresh.sh` l'écrit. Vérifier : `docker compose config >/dev/null && echo ok`.

### 16.5 Certificat et Nginx

```sh
sudo tee /etc/nginx/sites-available/jentapp-validation.conf >/dev/null <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name val.jentapp.nocly.fr;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/jentapp-validation.conf /etc/nginx/sites-enabled/jentapp-validation.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d val.jentapp.nocly.fr

sudo cp /tmp/jentapp-validation.conf /etc/nginx/sites-available/jentapp-validation.conf
sudo nginx -t && sudo systemctl reload nginx
```

La conf ajoute `X-Robots-Tag: noindex` et sert la même page de maintenance que la production.

### 16.6 Premier rafraîchissement

Il faut au moins une sauvegarde de production (étape 9). Avec l'étiquette qui tourne en production :

```sh
docker inspect --format '{{.Config.Image}}' "$(cd /opt/jentapp && docker compose ps -q app)"
sudo JENTAPP_TAG=sha-abc1234 /opt/jentapp-validation/refresh.sh
curl -s http://127.0.0.1:3100/api/health
```

`refresh.sh` refuse de tourner si le `.env` n'a pas `APP_ENV=validation`. Il ne touche jamais la base de production : il lit la dernière sauvegarde de `/var/backups/jentapp/` (ou celle donnée en argument), recrée la base de la validation, restaure les photos, applique les migrations de l'image demandée, nettoie les comptes, remet tes abonnements push de validation, note l'étiquette dans `.env`, redémarre et lance `ledger-check`. `sudo` : les sauvegardes ne sont lisibles que par root.

Après chaque rafraîchissement, tes sessions de validation sont effacées : reconnecte-toi sur l'iPhone.

### 16.7 iPhone

Ouvrir `https://val.jentapp.nocly.fr` dans Safari, se connecter avec ton compte, l'installer sur l'écran d'accueil (« Validation » sous l'icône, bandeau « VALIDATION » en haut de chaque écran), puis y activer les notifications.

### 16.8 Au quotidien

```sh
/opt/jentapp-validation/validation.sh status
/opt/jentapp-validation/validation.sh stop      # libère la mémoire ; les données restent
/opt/jentapp-validation/validation.sh start     # même image qu'au dernier rafraîchissement
```

Emails envoyés par la validation : `ssh -L 8025:127.0.0.1:8025 <vps>`, puis `http://localhost:8025` sur ton poste.

Incarner un joueur qui signale un problème : les comptes nettoyés n'ont plus de mot de passe.

```sh
cd /opt/jentapp-validation
docker compose exec app node scripts/validation-login.ts <pseudo> <mot de passe>
# Paco : connecte-toi sur la validation avec joueur-12@validation.invalid et ce mot de passe.
```

La validation n'est pas sauvegardée : ses données se reprennent de la production à chaque rafraîchissement.

## Publier une version

| Étape | Où | Commande ou geste |
| --- | --- | --- |
| 1. Numéro et notes | Dépôt | Monter la version dans `package.json`, écrire `content/releases/{version}.md` |
| 2. Image | GitHub | `git push origin main`, attendre la CI : elle publie `sha-…` |
| 3. Copie de la production | VPS | `/opt/jentapp-validation/refresh.sh` avec `JENTAPP_TAG=sha-…` |
| 4. Essai | iPhone | La feuille « Quoi de neuf » s'affiche, le push arrive, la nouveauté marche, rien d'autre n'est cassé |
| 5. Promotion | VPS | `/opt/jentapp/promote.sh` : sauvegarde, même image, contrôle du journal |
| 6. Contrôle | iPhone | La production affiche la nouvelle version dans Aide et légal |

- Le push part au démarrage de la production : éviter de promouvoir la nuit.
- Retour arrière : `JENTAPP_TAG=<sha précédent> /opt/jentapp/deploy.sh`, et restauration de la sauvegarde si une migration est passée.
- Numérotation : `2.x.0` pour une nouveauté visible, `2.x.y` pour une correction.

Les commandes exactes des étapes 3 et 5 :

```sh
sudo JENTAPP_TAG=sha-abc1234 /opt/jentapp-validation/refresh.sh
/opt/jentapp/promote.sh
```
