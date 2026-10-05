# Stickers dans le chat

**Objectif.** Un joueur touche un sticker dans le clavier de son iPhone, ou colle une image, et elle part dans le chat de la ligue.

**Terminé quand** un sticker envoyé depuis un iPhone sur la validation s'affiche chez un autre joueur en direct, et disparaît du serveur quand son message est supprimé.

## Ce que l'essai a montré

Journal relevé sur `/kit/stickers`, iPhone, le 5 octobre 2026 :

- Toucher un sticker déclenche un événement `paste` qui porte un fichier : `image/png`, 480 × 480, environ 280 Ko, nommé `image.png`.
- C'est vrai dans la zone éditable **et dans le `textarea`**. Dans le `textarea`, rien n'est inséré, mais l'événement et son fichier arrivent quand même.

Conséquence : le champ de saisie actuel suffit. Il n'y a pas à le remplacer par une zone éditable ; il faut seulement écouter `paste`.

Ce que l'essai n'a pas montré : le format d'un sticker animé ou d'un Memoji. La spec les accepte quel que soit leur format d'image ; ils seront vérifiés sur la validation.

## Décisions

| Sujet | Décision |
| --- | --- |
| Entrée | L'événement `paste` du champ du chat, quand il porte un fichier image. Un collage de texte reste un collage de texte |
| Portée | Toute image collée devient un sticker, y compris une photo copiée : elle est réduite à la taille d'un sticker, jamais affichée en grand |
| Stockage | Sur le volume `uploads`, converti en WebP, sans métadonnées |
| Accès | Réservé aux membres de la ligue |
| Version | `2.1.0`, première version annoncée par la feuille « Quoi de neuf » |

## Périmètre

Sur `develop`, un commit par point. Logique serveur et tests d'abord, interface ensuite.

1. **Retirer la page d'essai.** `git revert` des deux commits de `/kit/stickers` (`ba15c85`, `2f4b96c`).
2. **Traitement de l'image.** Module `src/server/stickers`, § Traitement.
3. **Message de type `sticker`.** § Message.
4. **Lecture.** Route `GET /api/l/{ligue}/stickers/{nom}`, § Accès.
5. **Suppression.** § Nettoyage.
6. **Saisie.** § Saisie.
7. **Affichage dans le fil.** § Affichage.
8. **Confidentialité.** Ajouter à `content/legal/confidentialite.md` : les images envoyées dans le chat sont stockées sur le serveur, visibles des membres de la ligue, et supprimées avec le message ou le compte.
9. **Version.** `package.json` à `2.1.0` et `content/releases/2.1.0.md`, § Note de version.

## Traitement

Le serveur ne fait jamais confiance au type annoncé par le navigateur : c'est `sharp` qui décide, en décodant le fichier.

| Règle | Valeur |
| --- | --- |
| Poids accepté | 5 Mo au plus |
| Formats acceptés | PNG, WebP, JPEG, GIF. Tout le reste est refusé, SVG compris |
| Dimensions décodées | Refus au-delà de 4096 px de côté, pour écarter une image piégée |
| Sortie | WebP, 512 px au plus sur le grand côté, proportions et transparence conservées, jamais agrandie |
| Métadonnées | Toutes retirées, position GPS comprise |
| Animation | Conservée jusqu'à 60 images ; au-delà, seule la première est gardée |

- Le nom du fichier est l'empreinte SHA-256 du résultat : `uploads/stickers/{ligue}/{empreinte}.webp`. Le même sticker envoyé dix fois dans une ligue n'est stocké qu'une fois.

## Message

- `kind = sticker`. `data` porte l'empreinte, la largeur, la hauteur et le poids. Texte facultatif dans `body`, avec les règles habituelles.
- Envoi par un formulaire qui porte le fichier et le texte. Mêmes gardes que pour un message : membre actif, 30 messages par minute.
- Le fichier est écrit avant la transaction ; si elle échoue, le nettoyage du § Nettoyage s'en charge.
- `message.new` est émis comme pour tout message.
- Ce que le serveur renvoie : l'adresse du sticker, ses dimensions, et les champs habituels d'un message. Jamais le chemin sur le disque.

## Accès

- `requireMember` : un non-membre reçoit `404`, comme partout.
- Le nom demandé doit être une empreinte de 64 caractères hexadécimaux. Tout autre nom : `404`, sans toucher au disque.
- `Cache-Control: private, max-age=31536000, immutable`, `Content-Type: image/webp`, `X-Content-Type-Options: nosniff`.
- Le service worker ne met pas ces images en cache.

## Nettoyage

- À la suppression d'un message `sticker`, le fichier est supprimé s'il n'est plus cité par aucun autre message de la ligue.
- Même règle à la suppression d'un compte, qui efface ses messages.
- La suppression d'une ligue supprime son dossier `uploads/stickers/{ligue}`.
- Script `scripts/stickers-gc.ts`, exécutable dans l'image : liste, puis supprime avec `--supprimer`, les fichiers qu'aucun message ne cite. Il rattrape les envois interrompus.

## Saisie

- Sur `paste` dans le champ du chat : si l'événement porte au moins un fichier image, le collage par défaut est annulé et la première image est retenue. Sinon rien ne change.
- L'image retenue s'affiche en aperçu au-dessus du champ, en 64 px, avec un bouton « Retirer » de 44 px.
- Le bouton d'envoi part dès qu'il y a un sticker, même sans texte. Sticker et texte partent dans le même message.
- Un nouveau collage remplace l'aperçu.
- Pendant l'envoi : aperçu grisé, bouton inactif. En cas d'échec, l'aperçu reste et le message d'erreur s'affiche.
- Aucun nouveau bouton dans la barre de saisie.

## Affichage

- Un sticker s'affiche sans bulle, à 160 px au plus sur le grand côté, proportions conservées, avec `width` et `height` renseignés pour que le fil ne saute pas au chargement.
- L'auteur, l'heure, le « j'aime » et la feuille d'actions se comportent comme pour un message.
- Le texte éventuel s'affiche dessous, dans une bulle ordinaire.
- Texte de remplacement : « Sticker de {pseudo} ».
- Dans une notification de mention ou un aperçu, un sticker sans texte se lit « Sticker ».

À reporter dans `docs/design.md`, section Chat : l'aperçu au-dessus du champ et le sticker dans le fil. Vérifier les deux aux tailles de `pnpm test:screens`.

## Messages

| Cas | Message |
| --- | --- |
| Trop lourd | Image trop lourde : 5 Mo au plus. |
| Format refusé | Ce format n'est pas accepté. Essaie un autre sticker. |
| Image illisible | Impossible de lire cette image. |
| Envoi en échec | Le sticker n'est pas parti. Réessaie. |

## Note de version

`content/releases/2.1.0.md`, la date étant celle de la promotion :

```
date: 2026-10-XX
title: Les stickers arrivent dans le chat

- Envoie les stickers de ton iPhone dans le chat : touche-en un dans le clavier, il part avec ton message.
- Une image copiée se colle aussi dans le chat, au format sticker.
- Les nouveautés s'affichent ici à chaque mise à jour.
- Une page d'attente remplace l'erreur pendant les mises à jour.
```

## Tests

| Sujet | Tests |
| --- | --- |
| Traitement | PNG de 480 px : WebP, transparence conservée, pas agrandi. Photo de 4000 px : réduite à 512 px. JPEG avec position GPS : aucune métadonnée en sortie. Fichier texte renommé en `.png`, SVG, fichier de 6 Mo, image de 5000 px : refusés. GIF animé : animation conservée |
| Déduplication | Le même sticker envoyé deux fois : un seul fichier, deux messages |
| Accès | Non-membre : `404`. Membre d'une autre ligue : `404`. Nom qui n'est pas une empreinte, ou qui contient `..` : `404` |
| Nettoyage | Suppression du seul message qui cite le fichier : fichier supprimé. Suppression d'un message sur deux : fichier gardé. Suppression du compte, de la ligue : fichiers supprimés. `stickers-gc` trouve un fichier orphelin |
| Message | Limite de 30 par minute partagée avec les messages texte. Texte facultatif. Aucun chemin de disque dans la réponse |
| Saisie | Un collage de texte n'est pas intercepté. Un collage d'image affiche l'aperçu et n'insère rien dans le champ |
| Direct | Le sticker apparaît chez un autre membre sans recharger |

## Hors périmètre

Bibliothèque de stickers et stickers récents. Bouton pour choisir une photo. Affichage d'une image en grand. Stickers depuis le clavier Android : à essayer sur la validation, sans engagement.

## Critères de fin

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` et `pnpm test:screens` passent ; la CI est verte.
- [ ] Sur la validation, depuis un iPhone : un sticker découpé dans une photo, un Memoji et un sticker animé partent et s'affichent chez un autre compte, sans recharger.
- [ ] Une image copiée depuis Photos se colle et s'affiche au format sticker.
- [ ] Un collage de texte marche comme avant.
- [ ] Message supprimé : le fichier n'est plus dans `uploads/stickers`.
- [ ] La feuille « Quoi de neuf · 2.1.0 » s'affiche sur la validation et le push arrive.
- [ ] `docs/design.md` est à jour, et la page `/kit/stickers` n'existe plus.

## Consigne pour Claude Code

> Travaille sur `develop`. Lis `CLAUDE.md`, `docs/M4.md`, `docs/design.md` et `docs/STICKERS.md`. Implémente uniquement `docs/STICKERS.md`, dans l'ordre du périmètre, un commit par point, logique serveur et tests avant l'interface. N'ajoute aucune dépendance : `sharp` est déjà là. Ne remplace pas le champ de saisie par une zone éditable. Lance `pnpm lint`, `pnpm typecheck` et `pnpm test` avant chaque fin de point. Si un choix n'est couvert par aucun document, arrête-toi et pose la question. À la fin, coche les critères vérifiables en local et liste ceux qui demandent l'iPhone sur la validation.