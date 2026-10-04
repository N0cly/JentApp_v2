#!/usr/bin/env bash
# Message Telegram pour l'exploitation (docs/AUTOMATISATION.md, A.1).
# Usage : notify.sh "texte"
#   Lit TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID dans /opt/jentapp/notify.env.
#   Texte brut (sans parse_mode), coupé à 3500 caractères : Telegram en
#   accepte 4096.
# Ne fait jamais échouer l'appelant : sans configuration, ou si Telegram ne
# répond pas, une ligne au journal et code 0. Le jeton n'apparaît dans aucune
# sortie ni dans la ligne de commande de curl.
set -uo pipefail

CONFIG="${NOTIFY_ENV:-/opt/jentapp/notify.env}"
API="${TELEGRAM_API:-https://api.telegram.org}"
MAX_LENGTH=3500

token=""
# Toute ligne écrite au journal passe par ici, jeton masqué.
log() {
  local line="notify : $*"
  [ -n "$token" ] && line="${line//"$token"/<jeton>}"
  echo "$line" >&2
  command -v logger >/dev/null 2>&1 && logger -t jentapp-notify -- "$line" 2>/dev/null
  return 0
}
config_value() { sed -n "s/^$1=//p" "$CONFIG" | tail -1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }

text="${1:-}"
[ -n "$text" ] || { log "message vide : rien n'est envoyé"; exit 0; }
[ -r "$CONFIG" ] || { log "pas de configuration lisible ($CONFIG) : message non envoyé"; exit 0; }
token="$(config_value TELEGRAM_BOT_TOKEN)"
chat="$(config_value TELEGRAM_CHAT_ID)"
[ -n "$token" ] && [ -n "$chat" ] \
  || { log "TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant dans $CONFIG : message non envoyé"; exit 0; }

# Coupe en caractères, pas en octets, quand la locale le permet.
if [ "${#text}" -gt "$MAX_LENGTH" ]; then
  text="${text:0:$MAX_LENGTH}"
  command -v iconv >/dev/null 2>&1 && text="$(printf '%s' "$text" | iconv -c -f UTF-8 -t UTF-8)"
fi

# L'URL, qui porte le jeton, passe par l'entrée standard de curl.
response="$(
  printf 'url = "%s/bot%s/sendMessage"\n' "$API" "$token" \
    | curl -sS --max-time 15 --config - \
      --data-urlencode "chat_id=$chat" \
      --data-urlencode "text=$text" 2>&1
)"
status=$?
if [ "$status" -ne 0 ]; then
  log "Telegram injoignable (curl $status) : ${response:0:300}"
elif [[ "$response" != *'"ok":true'* ]]; then
  log "Telegram a refusé le message : ${response:0:300}"
fi
exit 0
