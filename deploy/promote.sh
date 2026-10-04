#!/usr/bin/env bash
# Promotion (docs/VALIDATION.md, A.10) : lit l'image qui tourne en validation et
# lance deploy.sh en production avec cette même étiquette. L'image n'est jamais
# reconstruite : ce qui a été essayé est ce qui part.
# Usage : promote.sh
set -euo pipefail

APP_DIR="${JENTAPP_DIR:-/opt/jentapp}"
VAL_DIR="${JENTAPP_VALIDATION_DIR:-/opt/jentapp-validation}"

fail() { echo "promotion : $*" >&2; exit 1; }

cd "$VAL_DIR" 2>/dev/null || fail "dossier de la validation introuvable : $VAL_DIR"
app="$(docker compose ps -q app)"
[ -n "$app" ] || fail "la validation ne tourne pas : rien à promouvoir"
health="$(docker inspect --format '{{.State.Health.Status}}' "$app")"
[ "$health" = "healthy" ] || fail "l'app de validation n'est pas saine ($health)"
image="$(docker inspect --format '{{.Config.Image}}' "$app")"
tag="${image##*:}"
[[ "$tag" == sha-* ]] || fail "étiquette inattendue en validation : $image"

echo "Promotion en production de $image"
JENTAPP_TAG="$tag" exec "$APP_DIR/deploy.sh"
