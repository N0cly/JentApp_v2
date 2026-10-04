# Automatisation

**Objectif.** Un push sur `develop` met la validation à jour tout seul, et Telegram te dit ce qui se passe : déploiements, promotions, échecs, sauvegardes, site injoignable.

**Terminé quand** un push sur `develop` déploie la validation sans que tu touches au VPS, et qu'un message Telegram te le confirme.

## Décisions

| Sujet | Décision |
| --- | --- |
| Outil | GitHub Actions, déjà en place. Pas de TeamCity ni d'exécuteur auto-hébergé |
| Validation | Déployée automatiquement à chaque push sur `develop`, par SSH |
| Production | Toujours manuelle, par `promote.sh` : elle envoie un push à tous les joueurs |
| Alertes | Telegram, par ton bot |
| Dépendances | Dependabot, chaque semaine, vers `develop` |

## Partie A — Dans le dépôt

Sur `develop`, un commit par point.

1. **`deploy/notify.sh`.** Envoie un message à Telegram.
    - Usage : `notify.sh "texte"`. Lit `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` dans `/opt/jentapp/notify.env`.
    - Texte brut, sans mise en forme, coupé à 3500 caractères.
    - Ne fait jamais échouer l'appelant : sans fichier de configuration ou si Telegram ne répond pas, il écrit une ligne dans le journal et sort avec 0.
    - Le jeton n'apparaît dans aucune sortie.
2. **Messages des scripts.** Chaque script prévient à la fin, en succès comme en échec :

   | Script | Succès | Échec |
      | --- | --- | --- |
   | `validation/deploy.sh` | `VAL déployée · sha-abc1234 · https://val.jentapp.nocly.fr` | `VAL ÉCHEC · sha-abc1234 · étape : healthcheck`, suivi des 15 dernières lignes du journal de l'app |
   | `validation/refresh.sh` | `VAL rafraîchie depuis la sauvegarde du 04/10 · sha-abc1234` | `VAL ÉCHEC du rafraîchissement · étape : …` |
   | `promote.sh` et `deploy.sh` de production | `PROD · JentApp 2.1.0 en ligne · sha-abc1234` | `PROD ÉCHEC · étape : …`, et le rappel de la commande de retour arrière |

3. **Sauvegarde.**
    - En échec : l'unité systemd de sauvegarde déclenche `notify.sh` par `OnFailure=`. Message : `SAUVEGARDE ÉCHEC · voir journalctl -u jentapp-backup`.
    - Manquante : un second minuteur, chaque matin à 9 h, vérifie que la sauvegarde la plus récente a moins de 26 heures. Sinon : `SAUVEGARDE MANQUANTE · la dernière date du …`.
4. **Déploiement commandé par la CI.** `deploy/validation/ci-deploy.sh`, lancé par une clé SSH qui ne peut rien faire d'autre :
    - Lit l'étiquette demandée dans `SSH_ORIGINAL_COMMAND` et n'accepte que la forme `sha-` suivie de 7 caractères hexadécimaux. Tout le reste est refusé et journalisé.
    - Si la validation est en pause, il ne déploie pas et envoie `VAL en pause · déploiement de sha-abc1234 ignoré`.
    - Sinon il lance `deploy.sh` avec cette étiquette.
    - `validation.sh stop` met la validation en pause, `validation.sh start` la reprend.
5. **Job `deploy-validation` dans la CI.**
    - Seulement sur un push sur `develop`, après la publication de l'image. Jamais sur une demande de fusion.
    - Se connecte en SSH et transmet `sha-<7 caractères du commit>`.
    - Secrets rangés dans un environnement GitHub `validation`, limité à la branche `develop` : `VALIDATION_SSH_KEY`, `VALIDATION_SSH_HOST`, `VALIDATION_SSH_PORT`, `VALIDATION_SSH_USER`, `VALIDATION_SSH_KNOWN_HOSTS`.
    - La clé d'hôte du VPS est vérifiée avec `VALIDATION_SSH_KNOWN_HOSTS`. Jamais de `StrictHostKeyChecking=no`.
    - Un seul déploiement à la fois : les suivants attendent leur tour.
    - Délai maximal : 10 minutes.
6. **CI en échec.** Un job final, sur `develop` et `main`, envoie `CI ÉCHEC · develop · abc1234 · <titre du commit> · <lien vers l'exécution>` quand un job précédent échoue. Secrets du dépôt : `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Rien sur les demandes de fusion.
7. **Dependabot.** `.github/dependabot.yml` :
    - Dépendances pnpm, actions GitHub et images Docker, chaque lundi matin, vers `develop`.
    - Versions mineures et correctives regroupées en une seule demande de fusion ; les majeures une par une.
    - Cinq demandes ouvertes au plus.
    - Même délai de sécurité avant d'adopter une version que celui déjà réglé dans le dépôt. Lire la documentation actuelle de Dependabot.
8. **Documentation.** `docs/DEPLOY.md` : la section « Automatisation », avec l'installation ci-dessous et la marche à suivre pour faire tourner la clé SSH.

## Partie B — À faire une fois, toi

**Clé de déploiement**, sur ton poste :

```bash
ssh-keygen -t ed25519 -f jentapp-validation-deploy -N "" -C "github-actions-validation"
ssh-keyscan -p <port> <hôte du VPS>      # sortie à mettre dans VALIDATION_SSH_KNOWN_HOSTS
```

Sur le VPS, ajouter cette ligne à `~/.ssh/authorized_keys`, en un seul tenant :

```
command="/opt/jentapp-validation/ci-deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA… github-actions-validation
```

Cette clé ne peut lancer que ce script, quoi qu'on lui demande. Supprime ensuite le fichier de la clé privée de ton poste, une fois copiée dans GitHub.

**GitHub**, dans les réglages du dépôt :

- [ ] Environnement `validation`, limité à la branche `develop`, avec les cinq secrets `VALIDATION_SSH_*`.
- [ ] Secrets du dépôt : `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID`.
- [ ] Dependabot : alertes et mises à jour de sécurité activées.

**VPS**

```bash
printf 'TELEGRAM_BOT_TOKEN=%s\nTELEGRAM_CHAT_ID=%s\n' '<jeton>' '<identifiant du chat>' > /opt/jentapp/notify.env
chmod 600 /opt/jentapp/notify.env
/opt/jentapp/notify.sh "Test depuis le VPS"
```

**Surveillance du site**, hors du VPS, sans code :

- [ ] Un service externe de surveillance (UptimeRobot, Healthchecks.io ou équivalent) qui appelle `https://jentapp.nocly.fr/api/health` chaque minute, attend `"status":"ok"`, et alerte ton bot Telegram. Il doit tourner ailleurs que sur le VPS : c'est lui qui te prévient quand le serveur entier tombe.
- [ ] Y ajouter l'expiration du certificat.

## Tests

| Sujet | Tests |
| --- | --- |
| `notify.sh` | Sans configuration : aucune erreur, code 0. Telegram injoignable : code 0. Le jeton n'apparaît pas dans la sortie |
| `ci-deploy.sh` | `sha-abc1234` accepté. `latest`, `develop`, une étiquette avec `;`, `$(…)` ou un espace : refusés, rien n'est lancé. En pause : pas de déploiement |
| CI | Le job de déploiement n'existe que pour un push sur `develop`. Aucun secret n'est utilisé sur une demande de fusion |
| Sauvegarde | Une sauvegarde de plus de 26 heures déclenche l'alerte ; une récente, non |

## Critères de fin

- [ ] `pnpm lint`, `pnpm typecheck` et `pnpm test` passent ; la CI est verte.
- [ ] En local : `ci-deploy.sh` refuse toutes les étiquettes malformées du § Tests.
- [ ] Après l'installation : un push sur `develop` met à jour `https://val.jentapp.nocly.fr` et envoie `VAL déployée` sur Telegram, sans intervention.
- [ ] Un échec provoqué (test cassé sur une branche d'essai fusionnée dans `develop`, puis annulé) envoie `CI ÉCHEC`.
- [ ] `docs/DEPLOY.md` est à jour.

## Plus tard

- Les retours des joueurs envoyés depuis l'app vers Telegram : ce sera une fonction de l'app, avec sa propre spec. `notify.sh` ne sert qu'à l'exploitation.
- Alerte de disque plein, si les images s'accumulent.

## Consigne pour Claude Code

> Travaille sur `develop`. Lis `CLAUDE.md`, `docs/DEPLOY.md`, `docs/VALIDATION.md` et `docs/AUTOMATISATION.md`, puis `deploy/` et `.github/workflows/`. Implémente uniquement la partie A, dans l'ordre, un commit par point. Lis la documentation actuelle de Dependabot et de l'API des bots Telegram avant de les utiliser. Ne te connecte à aucun serveur, n'envoie aucun message Telegram réel et n'écris aucun secret dans le dépôt. Si un choix n'est couvert par aucun document, arrête-toi et pose la question. À la fin, coche les critères vérifiables en local et redonne-moi la partie B avec les commandes exactes.