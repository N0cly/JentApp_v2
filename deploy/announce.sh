#!/usr/bin/env bash
# Annonce à tous les joueurs (docs/ANNONCE.md), depuis le VPS.
# Usage : announce.sh "<message>"             aperçu, rien n'est envoyé
#         announce.sh --envoyer "<message>"   envoi
set -euo pipefail

cd "${JENTAPP_DIR:-/opt/jentapp}"
exec docker compose exec -T app node scripts/announce.ts "$@"
