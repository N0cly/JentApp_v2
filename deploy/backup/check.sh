#!/usr/bin/env bash
# Sauvegarde manquante (docs/AUTOMATISATION.md, A.3) : la plus récente doit avoir
# moins de 26 heures. Sinon, un message Telegram et code 1.
# Usage : check.sh   (lancé chaque matin par jentapp-backup-check.timer, en root :
#   les sauvegardes ne sont lisibles que par lui)
set -euo pipefail

DEST="${BACKUP_DIR:-/var/backups/jentapp}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
NOTIFY="${NOTIFY:-/opt/jentapp/notify.sh}"

notify() {
  if [ -x "$NOTIFY" ]; then "$NOTIFY" "$1" || true; else echo "notification non envoyée : $NOTIFY introuvable" >&2; fi
}

latest="$(ls -1t "$DEST"/jentapp-*.dump 2>/dev/null | head -1 || true)"
if [ -z "$latest" ]; then
  echo "sauvegarde manquante : aucune dans $DEST" >&2
  notify "SAUVEGARDE MANQUANTE · aucune sauvegarde dans $DEST"
  exit 1
fi
if [ -n "$(find "$latest" -mmin -"$((MAX_AGE_HOURS * 60))")" ]; then
  echo "sauvegarde à jour : $latest"
  exit 0
fi
when="$(date -r "$latest" '+%d/%m à %H:%M')"
echo "sauvegarde manquante : la dernière date du $when ($latest)" >&2
notify "SAUVEGARDE MANQUANTE · la dernière date du $when"
exit 1
