#!/usr/bin/env bash
# Déploiement de JentApp sur le VPS (docs/PROD.md, A.9) : sauvegarde, image,
# redémarrage, attente du healthcheck, contrôle du journal. S'arrête à la
# première erreur.
# Usage : JENTAPP_TAG=sha-abc1234 deploy.sh
#   L'étiquette est obligatoire, jamais `latest` : d'ordinaire, promote.sh la
#   reprend de la validation. Une fois l'app saine, elle est notée dans le .env,
#   pour que toute commande Compose suivante garde la même image.
# Une migration ne se défait pas : en cas de retour arrière après une migration,
# restaurer la sauvegarde faite au début (backup/restore.sh).
set -euo pipefail

APP_DIR="${JENTAPP_DIR:-/opt/jentapp}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-$APP_DIR/backup/backup.sh}"

step() { echo "==> $*"; }
fail() { echo "déploiement : $*" >&2; exit 1; }

TAG="${JENTAPP_TAG:-}"
[ -n "$TAG" ] && [ "$TAG" != "latest" ] \
  || fail "étiquette explicite obligatoire : JENTAPP_TAG=sha-… $0 (ou promote.sh)"
export JENTAPP_TAG="$TAG"

cd "$APP_DIR"
echo "Version : $TAG"

step "Sauvegarde"
if [ -n "$(docker compose ps --status running -q db)" ]; then
  "$BACKUP_SCRIPT" || fail "sauvegarde en échec : rien n'a été changé"
else
  echo "Base arrêtée (premier déploiement ?) : rien à sauvegarder."
fi

step "Image"
docker compose pull

step "Redémarrage"
docker compose up -d

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

step "Étiquette notée dans le .env"
if grep -q '^JENTAPP_TAG=' .env; then
  sed -i.bak "s/^JENTAPP_TAG=.*/JENTAPP_TAG=$TAG/" .env && rm -f .env.bak
else
  echo "JENTAPP_TAG=$TAG" >> .env
fi

step "Contrôle du journal des clopes"
docker compose exec -T app node scripts/ledger-check.ts || fail "le journal a des écarts"

docker image prune -f >/dev/null
step "Déploiement terminé"
