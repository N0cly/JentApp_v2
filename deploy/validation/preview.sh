#!/usr/bin/env bash
# Aperçu des nouveautés sur la validation (docs/NOUVEAUTES.md, § Aperçu) :
# affiche la note dans le terminal et réarme la feuille « Quoi de neuf » des
# comptes de VALIDATION_KEEP_EMAILS ; --push leur renvoie aussi le push.
# Refuse de tourner si le .env n'a pas APP_ENV=validation.
# Usage : preview.sh [--push] [--version x.y.z]
set -euo pipefail

VAL_DIR="${JENTAPP_VALIDATION_DIR:-/opt/jentapp-validation}"

fail() { echo "aperçu : $*" >&2; exit 1; }
env_value() { sed -n "s/^$1=//p" .env | tail -1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }

cd "$VAL_DIR" 2>/dev/null || fail "dossier introuvable : $VAL_DIR"
[ -f .env ] || fail "pas de .env dans $VAL_DIR"
[ "$(env_value APP_ENV)" = "validation" ] || fail "le .env de $VAL_DIR n'a pas APP_ENV=validation : refusé"
[ -n "$(docker compose ps -q app)" ] || fail "la validation ne tourne pas : validation.sh start"

exec docker compose exec -T app node scripts/release-preview.ts "$@"
