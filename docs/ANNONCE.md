# Annonce à tous les joueurs

**Objectif.** Depuis le VPS, une commande prévient tous les comptes : maintenance, nouveauté, coupure. Le message arrive dans le centre de notifications et en push.

**Terminé quand** la commande, lancée dans le conteneur de production, fait apparaître l'annonce chez deux comptes de ligues différentes, et en push chez celui dont l'app est fermée.

## Périmètre

Un commit par point.

1. **Type `announcement`.** Une annonce est globale : `notifications.league_id` devient facultatif, et vide pour ce type. Une ligne par compte non supprimé.
2. **Script `scripts/announce.ts`**, sur le modèle de `admin-grant.ts` : autonome, exécutable dans l'image de production, copié par le `Dockerfile`.
3. **Affichage.** Dans le centre, l'annonce porte « JENTAPP » à la place du nom de la ligue, et son texte tel quel. Un appui la marque lue, sans ouvrir d'autre page.
4. **Raccourci `deploy/announce.sh`**, à copier dans `/opt/jentapp/`, et la section « Administration » de `docs/DEPLOY.md`.
5. **Page de maintenance.** `deploy/nginx/maintenance.html`, autonome, aux couleurs de l'app, et dans `jentapp.conf` : `error_page 502 503 504` vers cette page. Elle s'affiche pendant qu'un déploiement redémarre le conteneur. Texte : « JentApp revient dans un instant. » et « Mise à jour en cours. Recharge la page dans une minute. »

## Commande

```sh
# Aperçu : affiche le message et le nombre de destinataires, n'envoie rien.
docker compose exec app node scripts/announce.ts "Maintenance ce soir à 23 h, coupure de 10 minutes."

# Envoi.
docker compose exec app node scripts/announce.ts --envoyer "Maintenance ce soir à 23 h, coupure de 10 minutes."
```

- Sans `--envoyer`, rien n'est écrit : c'est un aperçu.
- Message de 1 à 200 caractères, sinon erreur et code de sortie non nul.
- Sortie : « Annonce envoyée à 12 comptes, dont 7 abonnés au push. »
- Raccourci sur le VPS : `/opt/jentapp/announce.sh "…"` pour l'aperçu, `/opt/jentapp/announce.sh --envoyer "…"` pour l'envoi.

## Règles

- **Destinataires.** Tous les comptes non supprimés. Le niveau de notifications par ligue ne s'applique pas : une annonce de service passe toujours.
- **Écriture.** Toutes les lignes dans une seule transaction, puis le même signal `notification.new` que les autres notifications. C'est l'app en cours d'exécution qui envoie le push : le script n'embarque pas `web-push`.
- **Push.** Titre « JentApp », corps : le message, lien : `/notifications`. La règle habituelle reste : pas de push à un joueur dont l'app est ouverte, sa cloche prend le point.
- **Conservation.** Comme les autres notifications : 30 jours.
- Aucune interface : l'annonce ne se lance que depuis le serveur.

## Tests

| Sujet | Tests |
| --- | --- |
| Aperçu | Sans `--envoyer`, aucune ligne écrite |
| Envoi | Une ligne par compte non supprimé, aucune pour un compte supprimé. Un joueur au niveau « Rien » la reçoit |
| Limites | Message vide ou de plus de 200 caractères : erreur, rien d'écrit |
| Push | Le signal est émis après validation ; un joueur avec un flux ouvert ne reçoit pas de push |
| Centre | L'annonce s'affiche sans ligue, se marque lue, n'ouvre aucun lien |
| Autres types | Une notification de pari exige toujours un `league_id` |

## Critères de fin

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` et `pnpm build` passent.
- [ ] Dans l'image de production, en local : l'aperçu n'écrit rien ; l'envoi fait apparaître l'annonce chez deux comptes, et en push chez celui dont l'onglet est fermé.
- [ ] `nginx -t` valide la conf ; conteneur de l'app arrêté, un Nginx de test sert la page de maintenance.
- [ ] `docs/DEPLOY.md` et `docs/design.md` sont à jour.

## Consigne pour Claude Code

> Lis `CLAUDE.md`, `docs/M7.md`, `docs/DEPLOY.md` et `docs/ANNONCE.md`. Implémente uniquement `docs/ANNONCE.md`, dans l'ordre du périmètre, un commit par point, logique et tests avant l'interface. Tu peux modifier `deploy/`. Ne te connecte à aucun serveur. Si un choix n'est couvert par aucun document, arrête-toi et pose la question. À la fin, coche les critères de fin et donne-moi les commandes exactes à lancer sur le VPS.