#!/usr/bin/env bash
# Déploiement de la validation (docs/VALIDATION.md, A.10) : la commande de tous
# les jours. Tire l'image, redémarre, attend le healthcheck, contrôle le journal.
# Ne touche pas aux données : pour repartir d'une copie fraîche de la production,
# refresh.sh.
# Usage : deploy.sh
#   Étiquette `develop` par défaut, ou celle de JENTAPP_TAG (sha-…). Jamais
#   `latest`. Une fois l'app saine, elle est notée dans le .env, pour que
#   validation.sh start et refresh.sh gardent la même.
set -euo pipefail

VAL_DIR="${JENTAPP_VALIDATION_DIR:-/opt/jentapp-validation}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"

step() { echo "==> $*"; }
fail() { echo "déploiement de la validation : $*" >&2; exit 1; }
env_value() { sed -n "s/^$1=//p" .env | tail -1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }

cd "$VAL_DIR" 2>/dev/null || fail "dossier introuvable : $VAL_DIR"
[ -f .env ] || fail "pas de .env dans $VAL_DIR"
[ "$(env_value APP_ENV)" = "validation" ] || fail "le .env de $VAL_DIR n'a pas APP_ENV=validation : refusé"
project="$(env_value JENTAPP_PROJECT)"
[ -n "$project" ] && [ "$project" != "jentapp" ] \
  || fail "JENTAPP_PROJECT doit nommer le projet de validation, pas celui de la production"

TAG="${JENTAPP_TAG:-develop}"
[ "$TAG" != "latest" ] || fail "jamais latest en validation : develop ou sha-…"
export JENTAPP_TAG="$TAG"

echo "Validation : $VAL_DIR · image $TAG"

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
step "Validation déployée : $TAG ($(docker inspect --format '{{.Image}}' "$app"))"
