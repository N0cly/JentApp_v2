#!/usr/bin/env bash
# Promotion (docs/VALIDATION.md, A.11) : l'image exacte qui tourne en validation
# part en production, sans être reconstruite.
#   1. Lit l'image du conteneur de validation et le commit dont elle est issue.
#   2. Vérifie que `latest` désigne cette même image : le commit validé a bien
#      été fusionné dans main. Sinon, s'arrête en disant quoi faire.
#   3. Vérifie que l'étiquette sha-… du commit désigne encore cette image.
#   4. Affiche ce que les joueurs vont recevoir (docs/NOUVEAUTES.md, § Promotion) :
#      les notes de toutes les versions entre celle de la production
#      (/api/health) et celle de l'image validée, le texte du push, le nombre
#      de comptes notifiés et d'abonnés au push. Même version : rien ne sera
#      annoncé.
#   5. Demande de taper le numéro de la version pour confirmer ; --oui saute la
#      question. Un autre numéro, ou pas de réponse : rien n'est déployé.
#   6. Lance deploy.sh en production avec cette étiquette, qui prévient sur
#      Telegram. Un refus avant ce point prévient aussi (notify.sh), sauf une
#      confirmation refusée, qui est un choix.
# Usage : promote.sh [--oui]
set -euo pipefail

APP_DIR="${JENTAPP_DIR:-/opt/jentapp}"
VAL_DIR="${JENTAPP_VALIDATION_DIR:-/opt/jentapp-validation}"
NOTIFY="${NOTIFY:-$APP_DIR/notify.sh}"

YES=0
case "${1:-}" in
  "") ;;
  --oui) YES=1 ;;
  *) echo "Usage : promote.sh [--oui]" >&2; exit 2 ;;
esac

fail() { echo "promotion : $*" >&2; exit 1; }
image_id() { docker image inspect --format '{{.Id}}' "$1"; }
env_value() { sed -n "s/^$1=//p" "$APP_DIR/.env" 2>/dev/null | tail -1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
plural() { if [ "$1" -gt 1 ]; then echo "$1 $2s"; else echo "$1 $2"; fi; }
# Vrai si la version $1 est plus récente que $2.
newer() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" = "$1" ]; }
# Telegram (docs/AUTOMATISATION.md, A.2). Ne fait jamais échouer le script.
notify() {
  if [ -x "$NOTIFY" ]; then "$NOTIFY" "$1" || true; else echo "notification non envoyée : $NOTIFY introuvable" >&2; fi
}

# Jusqu'à deploy.sh, seuls des refus : la production n'a pas changé.
STAGE="validation"
finish() {
  local status=$?
  [ "$status" -eq 0 ] || notify "PROD ÉCHEC · étape : $STAGE
Rien n'a changé en production."
}
trap finish EXIT

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

STAGE="vérification de latest"
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

STAGE="vérification de $tag"
docker pull -q "$repo:$tag" >/dev/null || fail "impossible de tirer $repo:$tag"
[ "$(image_id "$repo:$tag")" = "$validated" ] \
  || fail "$repo:$tag ne désigne plus l'image validée : redéployer la validation et réessayer"

STAGE="nouveautés"
# Version de l'image validée, et celle de la production d'après /api/health.
# Une production d'avant la version dans /api/health : son package.json.
version="$(docker run --rm "$validated" node -p "require('./package.json').version")"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "version illisible dans l'image validée"
health_url="http://127.0.0.1:$(env_value JENTAPP_PORT | grep . || echo 3000)/api/health"
prod="$(curl -fsS --max-time 5 "$health_url" 2>/dev/null | sed -n 's/.*"version":"\([0-9.]*\)".*/\1/p' || true)"
if [ -z "$prod" ]; then
  prod="$(cd "$APP_DIR" && docker compose exec -T app node -p "require('./package.json').version" 2>/dev/null || true)"
fi
echo "En production : ${prod:-version inconnue}. Validée : $version."
echo

ANNOUNCE=""
if [ "$prod" = "$version" ]; then
  echo "La version ne change pas : rien ne sera annoncé, ni feuille ni push."
elif [ -n "$prod" ] && newer "$prod" "$version"; then
  echo "La validation porte une version plus ancienne que la production : rien ne sera annoncé."
else
  if [ -n "$prod" ]; then
    docker run --rm "$validated" node scripts/release-notes.ts --after "$prod" "$version" \
      || fail "notes illisibles dans l'image validée"
  else
    docker run --rm "$validated" node scripts/release-notes.ts "$version" \
      || fail "notes illisibles dans l'image validée"
  fi
  title="$(docker run --rm "$validated" node scripts/release-notes.ts --title "$version")"
  reach="$(cd "$APP_DIR" && docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*), count(*) filter (where exists (select 1 from push_subscriptions p where p.user_id = u.id)) from users u where u.deleted_at is null"')" \
    || fail "comptes de la production illisibles"
  accounts="${reach%%|*}"
  subscribers="${reach##*|}"
  echo
  echo "Notification à $(plural "$accounts" compte), dont $(plural "$subscribers" abonné) au push."
  ANNOUNCE="$title
$(plural "$subscribers" abonné) au push sur $(plural "$accounts" compte)"
fi
echo

if [ "$YES" -eq 0 ]; then
  printf 'Pour déployer, tape le numéro de la version (%s) : ' "$version"
  answer=""
  read -r answer || true
  if [ "$answer" != "$version" ]; then
    echo
    echo "promotion : « $answer » n'est pas $version. Rien n'a été déployé." >&2
    trap - EXIT
    exit 1
  fi
fi

echo "Promotion en production de $repo:$tag"
trap - EXIT
JENTAPP_ANNOUNCE="$ANNOUNCE" JENTAPP_TAG="$tag" exec "$APP_DIR/deploy.sh"
