#!/usr/bin/env bash
# Promotion (docs/VALIDATION.md, A.11) : l'image exacte qui tourne en validation
# part en production, sans être reconstruite.
#   1. Lit l'image du conteneur de validation et le commit dont elle est issue.
#   2. Vérifie que `latest` désigne cette même image : le commit validé a bien
#      été fusionné dans main. Sinon, s'arrête en disant quoi faire.
#   3. Vérifie que l'étiquette sha-… du commit désigne encore cette image.
#   4. Lance deploy.sh en production avec cette étiquette.
# Usage : promote.sh
set -euo pipefail

APP_DIR="${JENTAPP_DIR:-/opt/jentapp}"
VAL_DIR="${JENTAPP_VALIDATION_DIR:-/opt/jentapp-validation}"

fail() { echo "promotion : $*" >&2; exit 1; }
image_id() { docker image inspect --format '{{.Id}}' "$1"; }

cd "$VAL_DIR" 2>/dev/null || fail "dossier de la validation introuvable : $VAL_DIR"
app="$(docker compose ps -q app)"
[ -n "$app" ] || fail "la validation ne tourne pas : rien à promouvoir"
health="$(docker inspect --format '{{.State.Health.Status}}' "$app")"
[ "$health" = "healthy" ] || fail "l'app de validation n'est pas saine ($health)"

validated="$(docker inspect --format '{{.Image}}' "$app")"
ref="$(docker inspect --format '{{.Config.Image}}' "$app")"
repo="${ref%:*}"
revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$validated")"
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || fail "commit inconnu pour l'image de validation $ref ($validated)"
tag="sha-${revision:0:7}"
echo "En validation : $ref, commit ${revision:0:7} ($validated)"

docker pull -q "$repo:latest" >/dev/null || fail "impossible de tirer $repo:latest"
if [ "$(image_id "$repo:latest")" != "$validated" ]; then
  cat >&2 <<MSG
promotion : $repo:latest ne désigne pas l'image qui tourne en validation (commit ${revision:0:7}).
  - Si ce commit n'est pas encore sur main, depuis le dépôt :
      git checkout main && git merge --ff-only develop && git push origin main && git checkout develop
    attendre que la CI ait ajouté latest, puis relancer promote.sh.
  - Si main est déjà plus loin, la validation n'a pas essayé ce qui partirait :
    /opt/jentapp-validation/deploy.sh, essayer, puis relancer promote.sh.
Rien n'a été changé en production.
MSG
  exit 1
fi

docker pull -q "$repo:$tag" >/dev/null || fail "impossible de tirer $repo:$tag"
[ "$(image_id "$repo:$tag")" = "$validated" ] \
  || fail "$repo:$tag ne désigne plus l'image validée : redéployer la validation et réessayer"

echo "Promotion en production de $repo:$tag"
JENTAPP_TAG="$tag" exec "$APP_DIR/deploy.sh"
