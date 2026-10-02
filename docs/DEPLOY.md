# Déploiement

L'app tourne sur le VPS dans Docker Compose (`app` + `db`), derrière le Nginx de la machine. L'image est construite par la CI et publiée sur `ghcr.io/n0cly/jentapp_v2` à chaque push sur `main`.

Domaine : `jentapp.nocly.fr`.

## Prérequis

- Un enregistrement DNS `A` (et `AAAA` si IPv6) de `jentapp.nocly.fr` vers le VPS.
- Docker et le plugin Compose, avec le service Docker lancé au démarrage : `sudo systemctl enable docker`.
- Nginx et Certbot installés sur le VPS.
- Le port `3000` libre en local sur le VPS. S'il est pris, changer le port hôte dans `deploy/docker-compose.yml` et dans la conf Nginx.

## 1. Préparer le dossier

```sh
sudo mkdir -p /opt/jentapp && sudo chown "$USER" /opt/jentapp
cd /opt/jentapp
# Depuis le dépôt : deploy/docker-compose.yml → /opt/jentapp/docker-compose.yml
```

Créer `/opt/jentapp/.env` (jamais versionné), à partir de `.env.example` :

```sh
POSTGRES_USER=jentapp
POSTGRES_PASSWORD=<mot de passe long et aléatoire>
POSTGRES_DB=jentapp
APP_URL=https://jentapp.nocly.fr
```

`DATABASE_URL` est construite par le compose à partir de ces valeurs. Protéger le fichier : `chmod 600 .env`.

Si le paquet GHCR est privé, se connecter une fois avec un jeton GitHub qui a le droit `read:packages` :

```sh
echo "<jeton>" | docker login ghcr.io -u N0cly --password-stdin
```

## 2. Certificat Certbot

Servir le défi ACME en HTTP avant d'avoir le certificat :

```sh
sudo mkdir -p /var/www/certbot
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
```

Puis installer la conf complète, `deploy/nginx/jentapp.conf`, à la place :

```sh
sudo cp deploy/nginx/jentapp.conf /etc/nginx/sites-available/jentapp.conf
sudo nginx -t && sudo systemctl reload nginx
```

Les fichiers `options-ssl-nginx.conf` et `ssl-dhparams.pem` sont installés par le paquet Certbot pour Nginx. S'ils manquent, retirer les deux lignes `include` et `ssl_dhparam`. Le renouvellement est fait par le timer de Certbot ; le vérifier avec `sudo certbot renew --dry-run`.

## 3. Premier lancement

```sh
cd /opt/jentapp
docker compose pull
docker compose up -d
docker compose ps          # app et db doivent être « healthy »
curl -s https://jentapp.nocly.fr/api/health
# {"status":"ok","db":"ok"}
```

Les migrations sont appliquées au démarrage du conteneur `app`. Si elles échouent, le conteneur s'arrête : voir les logs.

## 4. Mise à jour

Après un push sur `main` et une CI verte :

```sh
cd /opt/jentapp
docker compose pull app
docker compose up -d app
docker image prune -f
```

Revenir à une version précise : chaque image porte aussi l'étiquette `sha-<commit court>`.

```sh
JENTAPP_TAG=sha-abc1234 docker compose up -d app
```

## 5. Logs

```sh
docker compose logs -f app       # l'app
docker compose logs -f db        # Postgres
docker compose logs --since 1h app
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

## 6. Vérifier le redémarrage

Les deux services sont en `restart: unless-stopped` et les données vivent dans les volumes `jentapp_pgdata` et `jentapp_uploads`.

```sh
docker compose exec db psql -U jentapp -d jentapp \
  -c "insert into app_meta values ('reboot-check', now()::text) on conflict (key) do update set value = excluded.value"
sudo reboot
# après le redémarrage
docker compose ps
docker compose exec db psql -U jentapp -d jentapp -c "select * from app_meta"
curl -s https://jentapp.nocly.fr/api/health
```

## Sauvegarde

Pas de sauvegarde automatisée en M0. Le volume `jentapp_pgdata` doit être couvert par la sauvegarde du VPS ; le choix d'un `pg_dump` quotidien est à trancher avant M7 (`docs/M0.md`).
