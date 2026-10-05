# Bugs hors périmètre

Notés en cours de jalon, sans le bloquer (`CLAUDE.md`, § Conventions).

## Zone d'appui d'une bulle de chat d'une ligne

- **Constaté** le 5 octobre 2026, pendant `docs/STICKERS.md`, avec `pnpm test:screens` sur un message court.
- **Quoi.** Une bulle de texte d'une seule ligne fait 37 px de haut (`py-2` et une ligne de 21 px). Le contrôle des zones d'appui de `pnpm test:screens` demande 44 px : « <button> « avec du texte » 126×37 ».
- **Pourquoi il n'apparaissait pas.** Le jeu de données extrême n'a que des messages de 500 caractères, donc des bulles de plusieurs lignes.
- **Piste.** Donner à la bulle une zone d'appui transparente de 44 px, comme l'avatar de 32 px du chat (`docs/design.md`, § Zones d'appui), et ajouter un message court au jeu de données extrême.
