#!/usr/bin/env bash
# Restaure une sauvegarde de JentApp dans une base vide (docs/PROD.md, A.8).
# Usage : restore.sh <jentapp-AAAA-MM-JJ.dump> [base cible] [uploads-AAAA-MM-JJ.tar.gz]
#   base cible : par défaut une nouvelle base « jentapp_restore » ; elle est créée
#   si elle n'existe pas, et la restauration refuse une base qui a déjà des tables.
#   L'archive des fichiers, si elle est donnée, est extraite dans le volume de l'app.
set -euo pipefail

APP_DIR="${JENTAPP_DIR:-/opt/jentapp}"
DUMP="${1:?Usage : restore.sh <fichier .dump> [base cible] [archive des fichiers]}"
TARGET="${2:-jentapp_restore}"
UPLOADS="${3:-}"

fail() { echo "restauration : $*" >&2; exit 1; }

[ -s "$DUMP" ] || fail "fichier introuvable ou vide : $DUMP"
[ -z "$UPLOADS" ] || [ -s "$UPLOADS" ] || fail "archive introuvable ou vide : $UPLOADS"
[[ "$TARGET" =~ ^[a-z_][a-z0-9_]*$ ]] || fail "nom de base invalide : $TARGET"
cd "$APP_DIR"

psql() { docker compose exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"$1\""; }

if [ "$(psql "select count(*) from pg_database where datname = '$TARGET'")" = "0" ]; then
  docker compose exec -T db sh -c "createdb -U \"\$POSTGRES_USER\" $TARGET"
fi
tables="$(docker compose exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d $TARGET -tAc \"select count(*) from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema')\"")"
[ "$tables" = "0" ] || fail "la base $TARGET n'est pas vide ($tables tables) : choisis une base vide"

docker compose exec -T db sh -c "pg_restore -U \"\$POSTGRES_USER\" -d $TARGET --no-owner --exit-on-error" \
  < "$DUMP" || fail "pg_restore a échoué"
echo "restauration : base $TARGET restaurée depuis $DUMP"

if [ -n "$UPLOADS" ]; then
  docker compose run --rm --no-deps -T --entrypoint tar app -xzf - -C /app/uploads \
    < "$UPLOADS" || fail "extraction des fichiers en échec"
  echo "restauration : fichiers extraits depuis $UPLOADS"
fi
