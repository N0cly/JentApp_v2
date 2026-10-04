#!/usr/bin/env bash
# Déploiement de la validation commandé par la CI (docs/AUTOMATISATION.md, A.4).
# Seule commande permise à la clé SSH de GitHub Actions (`command=` dans
# authorized_keys) : sshd lance ce script quoi qu'on lui demande, et place la
# demande dans SSH_ORIGINAL_COMMAND. Elle n'est jamais exécutée : elle ne sert
# que d'étiquette, et seule la forme sha-<7 caractères hexadécimaux> passe.
# En pause (validation.sh stop), rien n'est déployé.
set -euo pipefail

VAL_DIR="${JENTAPP_VALIDATION_DIR:-/opt/jentapp-validation}"
NOTIFY="${NOTIFY:-/opt/jentapp/notify.sh}"

log() {
  echo "ci-deploy : $*" >&2
  command -v logger >/dev/null 2>&1 && logger -t jentapp-ci-deploy -- "$*" 2>/dev/null
  return 0
}
notify() {
  if [ -x "$NOTIFY" ]; then "$NOTIFY" "$1" || true; else echo "notification non envoyée : $NOTIFY introuvable" >&2; fi
}

request="${SSH_ORIGINAL_COMMAND:-}"
if [[ ! "$request" =~ ^sha-[0-9a-f]{7}$ ]]; then
  log "demande refusée : $(printf '%q' "${request:0:200}")"
  exit 1
fi
tag="$request"

if [ -e "$VAL_DIR/.paused" ]; then
  log "validation en pause : $tag ignoré"
  notify "VAL en pause · déploiement de $tag ignoré"
  exit 0
fi

log "déploiement de $tag"
JENTAPP_TAG="$tag" exec "$VAL_DIR/deploy.sh"
