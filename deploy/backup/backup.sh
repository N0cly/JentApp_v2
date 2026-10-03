#!/usr/bin/env bash
# Sauvegarde quotidienne de JentApp (docs/PROD.md, A.8) : la base au format
# compressé de pg_dump, et une archive du volume des fichiers envoyés.
# Écrit dans /var/backups/jentapp/, un fichier daté par jour, 14 jours gardés.
# Usage : backup.sh   (lancé par jentapp-backup.timer, ou à la main)
set -euo pipefail
# Les sauvegardes contiennent des emails et des mots de passe hachés : lisibles par root seul.
umask 077

APP_DIR="${JENTAPP_DIR:-/opt/jentapp}"
DEST="${BACKUP_DIR:-/var/backups/jentapp}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DAY="$(date +%F)"

fail() { echo "sauvegarde : $*" >&2; exit 1; }

mkdir -p "$DEST"
chmod 700 "$DEST"
cd "$APP_DIR"

# Base : dump compressé, écrit d'abord sous un nom provisoire.
db="$DEST/jentapp-$DAY.dump"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "$db.tmp" || fail "pg_dump a échoué"
[ -s "$db.tmp" ] || fail "fichier de base vide : $db.tmp"
mv "$db.tmp" "$db"

# Fichiers envoyés (photos, avatars) : archive du volume, lue par l'image de l'app.
up="$DEST/uploads-$DAY.tar.gz"
docker compose run --rm --no-deps -T --entrypoint tar app -czf - -C /app/uploads . \
  > "$up.tmp" || fail "archive des fichiers envoyés en échec"
[ -s "$up.tmp" ] || fail "archive des fichiers envoyés vide : $up.tmp"
mv "$up.tmp" "$up"

# 14 jours gardés.
find "$DEST" -maxdepth 1 -type f \( -name 'jentapp-*.dump' -o -name 'uploads-*.tar.gz' \) \
  -mtime +"$((KEEP_DAYS - 1))" -delete

echo "sauvegarde : $db ($(du -h "$db" | cut -f1)), $up ($(du -h "$up" | cut -f1))"
