#!/usr/bin/env bash
# Rafraîchit la validation avec une sauvegarde de production (docs/VALIDATION.md, A.8).
# Ne se connecte jamais à la base de production : il lit un fichier de sauvegarde.
#   1. Refuse de tourner si le .env de la validation n'a pas APP_ENV=validation.
#   2. Prend la dernière sauvegarde de production, ou celle donnée en argument,
#      et l'archive des photos du même jour.
#   3. Met de côté les abonnements push de la validation des comptes gardés.
#   4. Arrête l'app, recrée la base, restaure la sauvegarde et les photos.
#   5. Applique les migrations de l'image demandée, nettoie, remet les abonnements.
#   6. Note l'étiquette dans le .env, redémarre l'app, attend le healthcheck.
#   7. Termine par ledger-check.
#   Prévient sur Telegram à la fin, en succès comme en échec (notify.sh).
# Usage : sudo JENTAPP_TAG=sha-abc1234 refresh.sh [jentapp-AAAA-MM-JJ.dump]
#   Sans JENTAPP_TAG, l'étiquette déjà notée dans le .env. Jamais `latest`.
#   sudo : les sauvegardes ne sont lisibles que par root.
set -euo pipefail

VAL_DIR="${JENTAPP_VALIDATION_DIR:-/opt/jentapp-validation}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/jentapp}"
RESTORE_SCRIPT="${RESTORE_SCRIPT:-/opt/jentapp/backup/restore.sh}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"
NOTIFY="${NOTIFY:-/opt/jentapp/notify.sh}"
# Telegram (docs/AUTOMATISATION.md, A.2). Ne fait jamais échouer le script.
notify() {
  if [ -x "$NOTIFY" ]; then "$NOTIFY" "$1" || true; else echo "notification non envoyée : $NOTIFY introuvable" >&2; fi
}

step() { echo "==> $*"; }
fail() { echo "rafraîchissement : $*" >&2; exit 1; }
# Valeur d'une variable du .env, sans guillemets.
env_value() { sed -n "s/^$1=//p" .env | tail -1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }

TAG="${JENTAPP_TAG:-}"
day=""
SUBS=""
STAGE="contrôles"
finish() {
  local status=$?
  [ -n "$SUBS" ] && rm -f "$SUBS"
  if [ "$status" -eq 0 ]; then
    notify "VAL rafraîchie depuis la sauvegarde du ${day:8:2}/${day:5:2} · $TAG"
  else
    notify "VAL ÉCHEC du rafraîchissement · étape : $STAGE"
  fi
}
trap finish EXIT

cd "$VAL_DIR" 2>/dev/null || fail "dossier introuvable : $VAL_DIR"
[ -f .env ] || fail "pas de .env dans $VAL_DIR"
[ "$(env_value APP_ENV)" = "validation" ] || fail "le .env de $VAL_DIR n'a pas APP_ENV=validation : refusé"
project="$(env_value JENTAPP_PROJECT)"
[ -n "$project" ] && [ "$project" != "jentapp" ] \
  || fail "JENTAPP_PROJECT doit nommer le projet de validation, pas celui de la production"

TAG="${JENTAPP_TAG:-$(env_value JENTAPP_TAG)}"
[ -n "$TAG" ] && [ "$TAG" != "latest" ] || fail "étiquette manquante : JENTAPP_TAG=sha-… $0"
export JENTAPP_TAG="$TAG"

DUMP="${1:-$(ls -1t "$BACKUP_DIR"/jentapp-*.dump 2>/dev/null | head -1 || true)}"
[ -n "$DUMP" ] && [ -s "$DUMP" ] || fail "aucune sauvegarde lisible (lancer avec sudo ?) : ${DUMP:-$BACKUP_DIR}"
day="$(basename "$DUMP" .dump)"
day="${day#jentapp-}"
UPLOADS="$(dirname "$DUMP")/uploads-$day.tar.gz"
[ -s "$UPLOADS" ] || fail "archive des photos introuvable : $UPLOADS"
KEEP="$(env_value VALIDATION_KEEP_EMAILS)"

echo "Validation : $VAL_DIR · image $TAG · sauvegarde $DUMP"

psql_db() { docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -X -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"; }

STAGE="image"
step "Image"
image="$(docker compose config --images | grep -m1 "/jentapp_v2:")"
docker compose pull --quiet app 2>/dev/null || docker image inspect "$image" >/dev/null \
  || fail "image introuvable : $image"

STAGE="abonnements mis de côté"
step "Abonnements push de la validation, pour les comptes gardés"
SUBS="$(mktemp)"
docker compose up -d --wait db >/dev/null
if [ "$(psql_db -tA -c "select to_regclass('public.push_subscriptions') is not null")" = "t" ]; then
  psql_db -v keep="$KEEP" > "$SUBS" <<'SQL'
copy (
  select s.id, s.user_id, s.endpoint, s.p256dh, s.auth, s.created_at
  from push_subscriptions s join users u on u.id = s.user_id
  where lower(u.email) = any(string_to_array(replace(lower(:'keep'), ' ', ''), ','))
) to stdout with (format csv);
SQL
fi
echo "$(wc -l < "$SUBS" | tr -d ' ') abonnement(s) mis de côté."

STAGE="arrêt de l'app"
step "Arrêt de l'app"
docker compose stop app

STAGE="base recréée"
step "Base recréée"
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'

STAGE="photos vidées"
step "Photos vidées"
docker compose run --rm --no-deps -T --entrypoint sh app -c 'find /app/uploads -mindepth 1 -delete'

STAGE="restauration"
step "Restauration"
JENTAPP_DIR="$VAL_DIR" "$RESTORE_SCRIPT" "$DUMP" "$(env_value POSTGRES_DB)" "$UPLOADS"

STAGE="migrations"
step "Migrations de l'image $TAG, sur les données de production"
docker compose run --rm --no-deps -T app node db/migrate.ts

STAGE="nettoyage"
step "Nettoyage"
docker compose run --rm --no-deps -T app node scripts/validation-scrub.ts

STAGE="abonnements remis"
step "Abonnements push remis"
{
  echo "create temp table kept_subs (like push_subscriptions);"
  echo "copy kept_subs (id, user_id, endpoint, p256dh, auth, created_at) from stdin with (format csv);"
  cat "$SUBS"
  echo '\.'
  echo "insert into push_subscriptions select * from kept_subs where user_id in (select id from users) on conflict do nothing;"
} | psql_db

STAGE="étiquette"
step "Étiquette notée dans le .env"
if grep -q '^JENTAPP_TAG=' .env; then
  sed -i.bak "s/^JENTAPP_TAG=.*/JENTAPP_TAG=$TAG/" .env && rm -f .env.bak
else
  echo "JENTAPP_TAG=$TAG" >> .env
fi

STAGE="redémarrage"
step "Redémarrage"
docker compose up -d

STAGE="healthcheck"
step "Attente du healthcheck (${HEALTH_TIMEOUT} s au plus)"
app="$(docker compose ps -q app)"
[ -n "$app" ] || fail "conteneur app introuvable"
waited=0
until [ "$(docker inspect --format '{{.State.Health.Status}}' "$app")" = "healthy" ]; do
  status="$(docker inspect --format '{{.State.Status}} {{.State.Health.Status}}' "$app")"
  if [ "$waited" -ge "$HEALTH_TIMEOUT" ] || [[ "$status" == exited* ]]; then
    docker compose logs --tail 50 app >&2
    fail "l'app n'est pas saine ($status)"
  fi
  sleep 5
  waited=$((waited + 5))
done
echo "App saine."

STAGE="ledger-check"
step "Contrôle du journal des clopes"
docker compose exec -T app node scripts/ledger-check.ts || fail "le journal a des écarts"

step "Validation rafraîchie : $TAG, données du $day"
