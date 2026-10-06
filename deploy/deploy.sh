#!/usr/bin/env bash
# Déploiement de JentApp sur le VPS (docs/PROD.md, A.9) : sauvegarde, image,
# redémarrage, attente du healthcheck, contrôle du journal. S'arrête à la
# première erreur.
# Usage : JENTAPP_TAG=sha-abc1234 deploy.sh
#   L'étiquette `sha-…` d'un commit est obligatoire : jamais `latest` ni
#   `develop`, qui changent d'image. D'ordinaire, promote.sh la reprend de la
#   validation. Une fois l'app saine, elle est notée dans le .env, pour que toute
#   commande Compose suivante garde la même image.
# Prévient sur Telegram à la fin, en succès comme en échec (notify.sh), avec la
# commande de retour arrière si la production a changé.
# Une migration ne se défait pas : en cas de retour arrière après une migration,
# restaurer la sauvegarde faite au début (backup/restore.sh).
set -euo pipefail

APP_DIR="${JENTAPP_DIR:-/opt/jentapp}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-$APP_DIR/backup/backup.sh}"
NOTIFY="${NOTIFY:-$APP_DIR/notify.sh}"

step() { echo "==> $*"; }
fail() { echo "déploiement : $*" >&2; exit 1; }
env_value() { sed -n "s/^$1=//p" .env | tail -1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
# Telegram (docs/AUTOMATISATION.md, A.2). Ne fait jamais échouer le script.
notify() {
  if [ -x "$NOTIFY" ]; then "$NOTIFY" "$1" || true; else echo "notification non envoyée : $NOTIFY introuvable" >&2; fi
}

STAGE="contrôles"
CHANGED=0
PREVIOUS=""
finish() {
  local status=$?
  if [ "$status" -eq 0 ]; then
    local version
    version="$(docker compose exec -T app node -p "require('./package.json').version" 2>/dev/null || true)"
    # promote.sh y ajoute le titre de la version et le nombre d'abonnés notifiés.
    notify "PROD · JentApp ${version:-?} en ligne · $TAG${JENTAPP_ANNOUNCE:+
$JENTAPP_ANNOUNCE}"
  elif [ "$CHANGED" -eq 1 ]; then
    notify "PROD ÉCHEC · étape : $STAGE
Retour arrière : JENTAPP_TAG=${PREVIOUS:-<sha précédent>} $APP_DIR/deploy.sh, puis restaurer la sauvegarde si une migration est passée (docs/DEPLOY.md, étape 10)."
  else
    notify "PROD ÉCHEC · étape : $STAGE
Rien n'a changé en production${PREVIOUS:+ : $PREVIOUS tourne toujours}."
  fi
}
trap finish EXIT

TAG="${JENTAPP_TAG:-}"
[ -f "$APP_DIR/.env" ] && PREVIOUS="$(cd "$APP_DIR" && env_value JENTAPP_TAG)"
[[ "$TAG" =~ ^sha-[0-9a-f]{7,40}$ ]] \
  || fail "étiquette explicite obligatoire, sha-… d'un commit : JENTAPP_TAG=sha-… $0 (ou promote.sh)"
export JENTAPP_TAG="$TAG"

cd "$APP_DIR"
echo "Version : $TAG"

STAGE="sauvegarde"
step "Sauvegarde"
if [ -n "$(docker compose ps --status running -q db)" ]; then
  "$BACKUP_SCRIPT" || fail "sauvegarde en échec : rien n'a été changé"
else
  echo "Base arrêtée (premier déploiement ?) : rien à sauvegarder."
fi

STAGE="image"
step "Image"
docker compose pull

STAGE="redémarrage"
CHANGED=1
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

STAGE="étiquette"
step "Étiquette notée dans le .env"
if grep -q '^JENTAPP_TAG=' .env; then
  sed -i.bak "s/^JENTAPP_TAG=.*/JENTAPP_TAG=$TAG/" .env && rm -f .env.bak
else
  echo "JENTAPP_TAG=$TAG" >> .env
fi

STAGE="ledger-check"
step "Contrôle du journal des clopes"
docker compose exec -T app node scripts/ledger-check.ts || fail "le journal a des écarts"

docker image prune -f >/dev/null || true
step "Déploiement terminé"
