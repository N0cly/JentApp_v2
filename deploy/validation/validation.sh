#!/usr/bin/env bash
# Marche et arrêt de la validation (docs/VALIDATION.md, A.11) : l'arrêter libère
# environ 500 Mo quand elle ne sert pas. Les données restent dans ses volumes.
# stop met aussi la validation en pause : ci-deploy.sh ne la redémarre plus à
# chaque push sur develop. start la reprend (docs/AUTOMATISATION.md, A.4).
# Usage : validation.sh start|stop|status
set -euo pipefail

VAL_DIR="${JENTAPP_VALIDATION_DIR:-/opt/jentapp-validation}"
PAUSED=".paused"

fail() { echo "validation : $*" >&2; exit 1; }
env_value() { sed -n "s/^$1=//p" .env | tail -1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }

cd "$VAL_DIR" 2>/dev/null || fail "dossier introuvable : $VAL_DIR"
[ -f .env ] || fail "pas de .env dans $VAL_DIR"
[ "$(env_value APP_ENV)" = "validation" ] || fail "le .env de $VAL_DIR n'a pas APP_ENV=validation : refusé"

case "${1:-}" in
  start)
    tag="$(env_value JENTAPP_TAG)"
    [ -n "$tag" ] && [ "$tag" != "latest" ] || fail "aucune étiquette dans le .env : lancer d'abord refresh.sh"
    echo "Démarrage de la validation sur $tag"
    rm -f "$PAUSED"
    docker compose up -d --wait
    ;;
  stop)
    touch "$PAUSED"
    docker compose stop
    ;;
  status)
    [ -e "$PAUSED" ] && echo "En pause : les déploiements de la CI sont ignorés."
    docker compose ps
    ;;
  *)
    echo "Usage : $0 start|stop|status" >&2
    exit 1
    ;;
esac
