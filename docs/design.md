# Design — JentApp v2

Ce document dit comment appliquer la maquette. Les valeurs viennent de `design/tokens.json`, l'apparence exacte des écrans de `design/screens/*.html`. En cas de doute, la page HTML de référence fait foi.

## Direction : le comptoir de nuit

Un bar-tabac après la fermeture, où chaque mise sort sur un ticket.

1. **Le ticket est la signature.** Une mise est un ticket de papier clair (`paper`) sur un fond de nuit. Le papier est réservé au ticket : prise de mise, pari réglé, pari partagé dans le chat, invitation à une ligue. Rien d'autre n'est clair.
2. **Les chiffres sont imprimés.** Montants, pots, cotes finales, comptes à rebours et rangs sont en mono.
3. **Le laiton se mérite.** `brand` marque une seule chose par écran : l'action principale ou ma sélection.
4. **Le pouce d'abord.** Cibles de 44 px minimum, actions en bas d'écran, quatre onglets.

## Fichiers de référence

- `design/tokens.json` : couleurs, styles de texte, espacements, rayons, avec une note d'usage par jeton.
- `design/screens/*.html` : les 40 écrans de l'app, un fichier par écran. La table du § Écrans donne le fichier, la route et le jalon de chacun.
- `design/icon/` : l'icône de l'app, en SVG et aux tailles du manifeste.
- `content/legal/*.md` : le texte des trois pages légales, à compléter et à faire relire.

Les pages HTML sont des images fidèles, pas du code à copier : styles en ligne, données d'exemple, aucune logique. Elles s'ouvrent dans un navigateur, à 390 px de large, et les liens mènent d'un écran à l'autre.

## Jetons

- Les couleurs, espacements et rayons de `tokens.json` deviennent des variables CSS (`--bg`, `--space-4`, `--radius-md`…). Aucune couleur, aucun rayon et aucun espacement n'est écrit en dur dans un composant.
- Un seul thème, `nuit`. Pas de thème clair.
- Les pages de référence emploient parfois des valeurs hors jetons (6, 10, 14 px…). On les ramène au jeton le plus proche, en suivant sa note d'usage. Les dimensions des contrôles (hauteurs de 44, 52 et 56 px, tailles d'icônes) et les épaisseurs de bordure ne sont pas des espacements : elles restent des tailles fixes.
- Trois niveaux de fond qui s'empilent : `bg`, `surface`, `surface-raised`. Pas d'ombre portée, pas de dégradé.
- Texte : `ink`, puis `ink-muted`, puis `ink-subtle`. `line` décore, `line-strong` borde un contrôle.
- `win` et `loss` ne sont jamais seuls : un signe (+ ou −), une coche, une croix ou un tampon les accompagne.
- Sur le papier, on n'utilise que `on-paper`, `on-paper-muted`, `on-paper-win` et `on-paper-loss`.

## Typographie

Deux familles, chargées avec `next/font/google`.

- **Bricolage Grotesque** pour tout ce qui se lit. Titres en 800 avec `font-stretch: 85%`, texte courant en 400, libellés en 600.
- **DM Mono** en 500 pour tout ce qui se compte.

Les styles nommés sont dans `tokens.json` : `display`, `title`, `heading`, `body`, `label`, `caption`, `data-xl`, `data`, `overline`. Les questions de pari sont en `heading`, jamais en capitales. Les capitales sont réservées à `overline`. Aucun texte sous 12 px.

## Icône de l'app

Un ticket de papier avec le J et une barre de laiton, sur fond `bg`. Les fichiers sont dans `design/icon` : `icon.svg` (source), `icon-512.png` et `icon-192.png` pour le manifeste (en `any` et `maskable`), `apple-touch-icon.png`, `favicon-32.png`. Dans l'interface, elle apparaît sur la connexion et l'écran d'installation, avec le nom en Bricolage Grotesque 800.

## Icônes

- Icônes au trait, grille de 24, épaisseur 1.75, bouts ronds, couleur du texte. Une bibliothèque au trait (Lucide) convient pour les icônes courantes.
- Aucun emoji dans l'interface.
- Trois icônes maison portent la monnaie et suivent toujours un nombre. À créer comme composants, `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"` :

```html
<!-- clope -->
<rect x="2" y="13" width="16" height="5" rx="1"/><path d="M6 13v5"/><path d="M21 13v5"/><path d="M17 9c0-2 2-2 2-4"/>
<!-- joint -->
<path d="M3 21l3.5-1.5L20 6l-2-2L4.5 17.5z"/><path d="M19 5l2-2"/><path d="M7 15l2 2"/>
<!-- paquet -->
<rect x="5" y="9" width="14" height="12" rx="1.5"/><path d="M5 13h14"/><path d="M9 9V4h3v5"/><path d="M12 6h3v3"/>
```

## Composants

| Composant | Rôle | À retenir |
| --- | --- | --- |
| `Button` | Action | Primaire (`brand` / `on-brand`, un par écran, 56 px en bas d'écran), secondaire (`surface`, bordure `line-strong`, 52 px), discret. Rayon `radius-md` |
| `IconButton` | Action en icône | 44 × 44, rond, `aria-label` obligatoire |
| `Chip` | Filtre, moment | 44 px, `radius-full`. Sélectionné : fond `ink`, texte `on-paper` |
| `Segmented` | Bascule de vue | Piste `surface`, segment actif sur fond `ink` |
| `Card` | Carte de pari | Fond `surface`, `radius-lg`, intérieur `space-4`, 12 px entre les blocs |
| `MomentBadge` | `BEFORE`, `NIGHT`, `AFTER`, `DAILY`, `SPÉCIAL` | `overline`, bordure `line-strong`, `radius-sm`. Tous identiques |
| `Countdown` | Échéance | Horloge + `data`. « Ferme dans » en `ink-muted`, en `loss` sous une heure. « S'ouvre dans » et « Versement dans » en `brand` |
| `BetOption` | Option d'un pari | 52 px minimum, `surface-raised`, `radius-md`. Ma mise : bordure `brand`, fond `brand-soft`, rappel « Ta mise · 5 ». Aucune cote affichée tant que le pari est ouvert |
| `Amount` | Montant | Nombre en mono suivi de l'icône clope en `brand`. Delta : `+19` en `win`, `−8` en `loss`, avec le vrai signe moins |
| `Ticket` | Signature | Fond `paper`, coins `radius-sm`, lignes libellé / valeur en mono, ligne de découpe : pointillés `on-paper-muted` et deux encoches rondes de 16 px de la couleur du fond derrière le ticket |
| `Stamp` | `GAGNÉ`, `PERDU` | Mono, capitales, bordure 2 px, incliné de −6°. Un seul par écran |
| `Avatar` | Joueur | Rond. La bordure portée est un anneau de couleur |
| `LeagueBadge` | Ligue | Carré arrondi avec l'initiale, pour ne pas le confondre avec un joueur |
| `LeagueSwitcher` | Ligue active | Pilule en haut à gauche de chaque onglet : badge, nom, chevron. Ouvre la feuille « Tes ligues » |
| `BottomSheet` | Feuille modale | Fond `surface-raised`, haut en `radius-lg`, poignée, bouton fermer, sur-titre `overline` facultatif |
| `TabBar` | Navigation | Quatre onglets : Paris, Classement, Chat, Moi. Actif en `brand` |
| `TextField` | Saisie | 52 px, `surface`, bordure `line-strong`, libellé visible au-dessus |

## Écrans

`{ligue}` est l'identifiant de la ligue active, porté par l'URL. Un écran se construit dans le jalon indiqué, à partir de sa page de référence.

| Écran | Référence | Route | Jalon |
| --- | --- | --- | --- |
| Connexion | `connexion.html` | `/connexion` | M1 |
| Inscription | `inscription.html` | `/inscription` | M1 |
| Mot de passe oublié | `mot-de-passe-oublie.html` | `/mot-de-passe-oublie` | M1 |
| Nouveau mot de passe | `mot-de-passe-oublie.html` (mise en page) | `/nouveau-mot-de-passe` | M1 |
| Réglages du compte | `reglages-du-compte.html` | `/compte` | M1 (profil), M7 (notifications) |
| Bienvenue, aucune ligue | `bienvenue.html` | `/bienvenue` | M1 |
| Rejoindre une ligue | `rejoindre-une-ligue.html` | `/j/{code}`, et `/j` avec le champ vide | M1 |
| Créer une ligue | `creer-une-ligue.html` | `/ligues/nouvelle` | M1 |
| Inviter | `inviter.html` | `/l/{ligue}/inviter` | M1 |
| Tes ligues | `ligues.html` | feuille, depuis le sélecteur | M1 |
| Réglages de la ligue | `reglages-de-la-ligue.html` | `/l/{ligue}/reglages` | M1 (nom, code), M2 (économie) |
| Membres et rôles | `membres.html` | `/l/{ligue}/reglages/membres` | M1 |
| Tournée générale | `tournee-generale.html` | feuille, depuis les réglages | M2 |
| Journal de la ligue | `journal.html` | `/l/{ligue}/reglages/journal` | M7 |
| Paris | `paris.html` | `/l/{ligue}/paris` | M3 |
| Nouveau pari | `nouveau-pari.html` | `/l/{ligue}/paris/nouveau` | M3 |
| Ticket de mise | `ticket-de-mise.html` | feuille, depuis une option | M3 |
| Pari ouvert | `pari-ouvert.html` | `/l/{ligue}/paris/{pari}` | M3 |
| Saisir le résultat | `saisir-le-resultat.html` | même route, pari fermé | M3 |
| Résultat en attente | `resultat-en-attente.html` | même route, pendant les 10 minutes | M3 |
| Pari réglé | `pari-regle.html` | même route, gains versés | M3 |
| Chat | `chat.html` | `/l/{ligue}/chat` | M4 |
| Choisir un GIF | `gif.html` | feuille, depuis le chat | M4 |
| Classement | `classement.html` | `/l/{ligue}/classement` | M5 |
| Profil d'un membre | `profil-d-un-membre.html` | feuille, depuis le classement ou le chat | M5 |
| Moi | `moi.html` | `/l/{ligue}/moi` | M2 (solde), M5 (statistiques, historique) |
| Moi : succès | `moi-succes.html` | même route, onglet | M6 |
| Moi : cosmétiques | `moi-cosmetiques.html` | même route, onglet | M6 |
| Boutique | `boutique.html` | `/l/{ligue}/boutique` | M6 |
| Catalogue (super-admin) | `catalogue.html` | `/admin/catalogue` | M6 |
| Notifications | `notifications.html` | `/notifications` | M7 |
| Présentation 1 : miser | `presentation-1-miser.html` | `/bienvenue/presentation` | M1 |
| Présentation 2 : le pot | `presentation-2-pot.html` | même route, étape 2 | M1 |
| Présentation 3 : les ligues | `presentation-3-ligues.html` | même route, étape 3 | M1 |
| Installer l'app | `installer-l-app.html` | `/installer` | M7 |
| Activer les notifications | `activer-les-notifications.html` | `/notifications/activer` | M7 |
| Aide et légal | `aide-et-legal.html` | `/compte/aide` | M1 |
| Conditions d'utilisation | `conditions-d-utilisation.html` | `/conditions` | M1 |
| Politique de confidentialité | `confidentialite.html` | `/confidentialite` | M1 |
| Mentions légales | `mentions-legales.html` | `/mentions-legales` | M1 |
| Supprimer mon compte | `supprimer-mon-compte.html` | `/compte/supprimer` | M1 |

## Ce que les écrans montrent du pari mutuel

- **Pari ouvert.** Les options n'ont pas de cote. La carte affiche le pot total, le nombre de parieurs et le créateur. La répartition reste cachée.
- **Ticket de mise.** Il indique le pot actuel et « Gain : connu à la fermeture ». Raccourcis de mise : +5 (un joint), +20 (un paquet), tapis.
- **Résultat en attente.** Pendant les 10 minutes avant versement, la carte affiche « Résultat saisi », par qui, et le compte à rebours du versement.
- **Pari réglé.** Le ticket porte la mise, la cote finale et le gain, avec le tampon. Dessous : la répartition des mises, puis les gains versés.
- **Mises rendues.** Dans l'historique, un pari remboursé affiche « rendu » et la raison.

## Règles d'intégration

- **Mobile d'abord.** Les maquettes sont à 390 px. Au-delà de 480 px, l'app reste une colonne centrée de 480 px au plus.
- **Zones sûres.** La barre d'onglets et les actions de bas d'écran respectent `env(safe-area-inset-bottom)`.
- **Accessibilité.** Vrais `button`, `a`, `input` avec `label`. Contraste 4.5:1 pour le texte, 3:1 pour les bordures de contrôle. Focus visible : contour `brand` de 2 px, décalé de 2 px.
- **États non dessinés.** Chargement : squelettes aux formes des cartes, en `surface-raised`. Liste vide : une phrase et une action (« Rien d'ouvert. Lance un pari. »). Erreur : une phrase qui dit quoi faire, jamais un code.
- **Voix.** Tutoiement, phrases courtes, pas d'emoji, pas de point d'exclamation en rafale. « Valider le ticket », pas « Confirmer la transaction ». « Il te manque 6 clopes. », pas « Fonds insuffisants ».
- **Données d'exemple.** Les pseudos, questions et montants des pages de référence sont des exemples : ne jamais les coder en dur.

## Tailles d'écran

`pnpm test:screens` ouvre chaque écran avec un jeu de données extrême (pseudo de 20 caractères sans espace, ligue de 30, question de 140, 8 options de 40, ligue de 50 membres, message de 500 caractères sans espace) et échoue sur un défilement horizontal, un élément hors de l'écran, une zone d'appui sous 44 px, une feuille coupée ou une colonne décentrée.

- **Tailles vérifiées.** 320 × 568, 360 × 740, 375 × 667, 390 × 844, 412 × 915, 430 × 932 ; 820 × 1180, où la colonne de 480 px reste centrée ; 844 × 390 en paysage ; 390 × 844 avec le texte agrandi à 200 %.
- **Couper avec des points de suspension** les pseudos et noms de ligue dans les en-têtes, les titres et les listes : sélecteur de ligue, titre d'écran, titre de la feuille Profil, valeurs des lignes de réglages, membres, podium, gains versés, pseudo au-dessus des bulles, ligue d'une notification. Une heure ou un compte à rebours à côté reste entier.
- **Passer à la ligne** pour tout ce qui se lit en phrase : questions, options, messages, journal, carte du classement, notifications, libellés de bouton, nom de ligue sur un ticket. Un mot sans espace se coupe plutôt que de déborder (`overflow-wrap` sur `body`, `anywhere` dans les contenants flex).
- **Montants** jamais coupés : sur un ticket, la valeur passe sous son libellé si les deux ne tiennent pas.
- **Sélecteur de ligue.** À 320 px, avec les trois actions de Paris, il se réduit à son badge ; l'appui ouvre toujours « Tes ligues ».
- **Bulles du chat.** 270 px au plus, comme la page de référence, et moins si l'écran est étroit.
- **Zones d'appui.** 44 px au moins. Un dessin plus petit garde sa taille et reçoit une zone d'appui transparente de 44 px : interrupteur de 52 × 32, avatar de 32 px du chat, ligne de message automatique. Un lien au fil d'une phrase (« conditions d'utilisation ») en est exempté.
- **Zones sûres.** `Screen` respecte `env(safe-area-inset-top)` et, hors écrans à onglets, `env(safe-area-inset-bottom)` ; `TabBar` et `BottomSheet` gèrent le bas.
- **Clavier.** `interactive-widget=resizes-content` : sur Android, la page se réduit au-dessus du clavier.
- **Orientation.** Le manifeste déclare le portrait ; en paysage, l'app reste utilisable.
- **Texte agrandi.** Les hauteurs fixes de texte deviennent des hauteurs minimales (barre d'onglets, champs) pour que rien ne se chevauche.

## Erreurs de formulaire

Pages de référence : `inscription-erreur.html` et `connexion-erreur.html`.

- **`TextField` en erreur.** La bordure passe de `line-strong` à `loss`, toujours 1 px. Le message remplace le texte d'aide sous le champ : icône d'alerte de 16 px suivie du texte, en `caption`, couleur `loss`. Le libellé ne change pas. `aria-invalid="true"` et `aria-describedby` vers le message. Le focus garde son contour `brand`.
- **Case à cocher en erreur.** Même message, sous la case.
- **Message de formulaire.** Pour une erreur qui ne tient pas à un champ (connexion refusée, trop de tentatives) : bloc `loss-soft`, `radius-md`, icône d'alerte de 18 px en `loss`, texte `ink` en 14 px et 600, `role="alert"`, placé au-dessus du premier champ.
- **À l'envoi.** Les erreurs s'affichent toutes ensemble et le focus va au premier champ en erreur. Une erreur disparaît dès que le champ est modifié.

## Ce qui n'a pas de maquette

Tous les écrans de la v2 sont maquettés. Restent des états et des variantes, à construire avec les composants existants, sans inventer de nouvelle apparence :

- Chargement, liste vide et erreur de chaque écran (règles ci-dessus).
- Classement en vue « Bilan net » : même écran, autre tri.
- Onglet « Avatars » de la boutique et onglet « Succès » du catalogue : mêmes grilles et mêmes lignes.
- Formulaire d'ajout ou de modification d'un cosmétique : `TextField`, `Chip` et `Button`.
- Modification du pseudo, de l'email ou du mot de passe : un champ et un bouton primaire.
- Transfert et suppression d'une ligue, exclusion d'un membre : une feuille de confirmation qui dit ce qui va se passer.
- Correction d'un résultat : c'est l'écran « Saisir le résultat », avec l'option déjà choisie.
- Pages légales : le texte vient de `content/legal`, la mise en page de la page de référence.
- Rappel « Confirme ton email » : le bandeau de l'écran Bienvenue, repris en haut de l'écran Paris tant que l'email n'est pas confirmé.
- Nouveau mot de passe : la mise en page de Mot de passe oublié, un champ et un bouton primaire.
- Quitter une ligue : dans Réglages de la ligue, la dernière ligne est « Transférer ou supprimer la ligue » pour l'owner et « Quitter la ligue » pour les autres, avec une feuille de confirmation.
- États vides de la coquille de ligue en M1 : une phrase, sans action.

Paris (M3), construits avec les composants existants :

- Pari fermé vu par quelqu'un qui ne peut pas saisir : l'écran « Saisir le résultat » sans sélection ni boutons, chaque option avec ses totaux, et la phrase « En attente du résultat. ». Titre « Pari ».
- Résultat en attente et pari réglé vus par quelqu'un qui n'a pas misé : le même écran sans le ticket.
- Ticket d'un perdant : au règlement, tampon `PERDU` ; la ligne « Gain » devient « Perte » avec `−{mise}`. Pendant le délai de versement, pas de tampon, ligne « Perte » aussi.
- Ticket d'une mise rendue : pas de tampon, ligne « Rendu » avec la mise et la raison (personne en face · pari annulé · égalité · sans résultat depuis 7 jours).
- Ajouter à sa mise : le ticket de mise avec l'option figée et une ligne « Déjà misé » au-dessus de « Mise ». Sur la page du pari ouvert, le bouton « Augmenter ma mise ».
- Modifier et annuler : en bas de la page du pari, deux boutons discrets, « Modifier le pari » (même formulaire que Nouveau pari, bouton « Enregistrer ») et « Annuler le pari », pour qui en a le droit. L'annulation passe par une feuille : « Annuler ce pari ? Toutes les mises sont rendues. »
- Correction du résultat : l'écran « Saisir le résultat » avec l'option déjà choisie.
- Cartes de la liste Paris : « Fermé · en attente du résultat », « Réglé » avec mon gain ou ma perte (ou « rendu »), « Annulé · mises rendues », dans la ligne d'état de la carte « Résultat saisi » de `paris.html`. Un pari programmé à question visible prend la carte du pari mystère, avec la question et « par {créateur} ».
- Page d'un pari programmé : la mise en page du pari ouvert, avec « S'ouvre dans », la question (ou « Pari mystère »), « Créé par », les options sans action, sans pot ; « Modifier » et « Annuler » pour qui en a le droit.
- Liste vide : « Rien d'ouvert. Lance un pari. », avec le bouton « Nouveau pari ».
- Interrupteur « Pari mystère » activé : piste `brand-soft` bordée de `brand`, pastille `brand` à droite.
- Heures dans le fuseau du téléphone : « à 23:30 » aujourd'hui, « le 12/10 à 23:30 » un autre jour.

Chat (M4), construits avec les composants existants :

- Actions sur un message : un appui ouvre la feuille « Message » avec « J'aime » ou « Retirer mon j'aime » (bouton secondaire), et « Supprimer » (discret, `loss`) pour l'auteur, un admin ou l'owner. La pastille du nombre de « j'aime » s'affiche dès le premier : `brand-soft` bordée de `brand` quand c'est le mien, sinon `surface` bordée de `line-strong` ; un appui dessus bascule le mien.
- Suggestion de mention : après `@`, au plus cinq membres qui correspondent, dans un bloc `surface-raised` au-dessus de la saisie (avatar 32 et pseudo).
- Choisir un pari à partager : la feuille « Partager un pari » liste les paris ouverts et programmés (« Pari mystère » pour un mystère) ; sans pari : « Aucun pari ouvert à partager. ».
- Séparateur de jour : l'overline des titres de jour de `journal.html`, centré ; « AUJOURD'HUI », « HIER », puis « LUNDI 5 OCTOBRE ».
- Nouveaux messages pendant qu'on lit plus haut : un `Chip` sélectionné « Nouveaux messages », en bas du fil, qui ramène en bas.
- Fil vide : « Personne n'a encore rien dit. »
- Message automatique : la ligne centrée de `chat.html` (icône ticket, mono 12, `ink-subtle`) ; s'il concerne un pari, elle mène à sa page, et « Nouveau pari » est suivi de la carte du pari.
- Carte d'un pari dans le chat, hors état ouvert : en haut à droite « S'OUVRE DANS hh:mm », « FERMÉ », « RÉSULTAT SAISI », « RÉGLÉ » ou « ANNULÉ » ; le bouton devient « Voir ». Un pari mystère programmé n'affiche que le moment, « S'OUVRE DANS » et « Pari mystère ».
- Feuille GIF : sans recherche, « Cherche un GIF. » (pas de tendances) ; sans résultat, « Aucun GIF pour cette recherche. ».
- Flux coupé ou erreur d'envoi : le message d'erreur des champs (icône d'alerte, `loss`) au-dessus de la saisie, « Connexion perdue. On réessaie… ».

Classement, Moi et Profil (M5), construits avec les composants existants :

- Ma ligne hors podium (4e et au-delà) : la ligne des autres, avec l'overline « TOI » sous le rang, comme sur le podium ; la carte se place juste dessous.
- Carte du premier : « Tu mènes la ligue. {n} clopes d'avance sur {pseudo}. » ; s'il y a des paris ouverts, « {n} paris ouverts pour creuser l'écart » et le bouton « Parier ». À égalité en tête : « Tu partages la tête avec {pseudo}. » ; à égalité plus bas : « À égalité avec {pseudo} ». Seul : « Personne d'autre ici. Invite la bande. » et le bouton « Inviter ».
- Podium à un ou deux membres : seules les places occupées, chacune dans sa colonne (deuxième à gauche, premier au centre).
- Vue « Bilan net » : même écran, valeurs signées en `win` ou `loss`, sans carte.
- Moi, en attendant Succès et Cosmétiques (M6) : le `Segmented` est remplacé par l'overline « HISTORIQUE », comme « DERNIERS PARIS » du profil. Le lien Boutique reste masqué. L'avatar garde l'anneau par défaut jusqu'à la bordure équipée (M6).
- Historique vide : « Aucun pari pour l'instant. Lance-toi. », avec le bouton « Voir les paris » vers l'onglet Paris.
- Lignes d'historique en cours et en attente du résultat : le rond neutre à horloge de la ligne « versement dans », sous-titre « {option} · mise {n} · ferme dans {durée} » ou « · en attente du résultat », valeur « en cours » ou « en attente » en `ink-muted`. Annulé : « · pari annulé », « · égalité » ou « · sans résultat depuis 7 jours », valeur « rendu ». « Voir plus » : bouton discret centré sous la liste.
- Profil sans pari réglé : ni « DERNIERS PARIS » ni lignes. Les lignes du profil ne mènent nulle part, comme sur la page de référence ; sur la feuille, le rond neutre passe en `surface`.
- Auteur d'un message du chat : un appui sur son avatar (zone de 44 px autour du dessin de 32 px) ouvre son profil ; parti ou supprimé, rien ne se passe. Le pseudo, au-dessus des bulles, est du texte tronqué : une zone de 44 px y empiéterait sur la bulle.

Boutique, succès et catalogue (M6), construits avec les composants existants :

- Apparence : l'avatar porté, sinon la photo, sinon l'initiale ; l'anneau prend la couleur de la bordure portée, sinon l'anneau par défaut. Personne ne porte de bordure tant qu'il n'en choisit pas une. Sur le podium, l'anneau est celui de la bordure portée ; l'épaisseur reste celle de la place (3 px pour le premier).
- Aperçus : une bordure s'affiche autour de mon image (ou de mon initiale), un avatar avec l'anneau par défaut, en 3 px.
- Boutique : elle s'ouvre sur Avatars s'il y en a en vente, sinon sur Bordures. Onglet vide : « Aucun avatar en vente pour l'instant. » (« Aucune bordure en vente pour l'instant. » pour l'autre onglet).
- Confirmation d'achat : feuille « Acheter {nom} pour {prix} clopes ? », l'aperçu et « Solde après achat » avec le montant, bouton primaire « Acheter ». Un refus s'affiche en message de formulaire dans la feuille.
- Moi, Cosmétiques : « Sans bordure » est la première carte de BORDURES, comme « Ta photo » dans AVATARS ; la carte pointillée « Boutique » ne figure que sous AVATARS.
- Moi, Succès : débloqués d'abord, puis les autres, dans l'ordre du catalogue ; les cachés non débloqués à la fin. La progression « · {x} sur {n} » et sa barre ne s'affichent que sur un succès verrouillé qui compte.
- Réglages du compte : la ligne « Catalogue », valeur « super-admin », n'apparaît qu'au super-admin.
- Catalogue, onglet Succès : mêmes lignes que les cosmétiques (médaille, nom, « {description} · +{récompense} », « · caché » s'il l'est, interrupteur), la note « Un succès désactivé ne se débloque plus ; ceux qui l'ont le gardent. » et le bouton « Ajouter un succès ».
- Formulaires du catalogue : une feuille, ouverte par une ligne ou par « Ajouter ». Cosmétique : `Segmented` Avatar / Bordure (à la création seulement), Nom, Prix en clopes, Couleur ou Image, Ordre, « Enregistrer ». Succès : des `Chip` pour la règle (Paris joués, Mise d'un coup, Tapis, Paris gagnés, Série, À sec, Paris lancés, Achats ; figée ensuite), Seuil (sauf À sec), Nom, Récompense en clopes, Ordre, la case « Caché », « Enregistrer ».

Notifications, journal et PWA (M7), construits avec les composants existants :

- Cloche : dans l'en-tête de Paris et de Classement, après le solde. Point de non-lu : pastille `loss` de 8 px en haut à droite de la cloche, posée en direct à l'arrivée d'une notification.
- Centre : icône par type (mention @, résultat horloge, nouveau pari ticket, tournée cadeau, réglé coche, annulé croix, annonce cloche), en `brand` tant que la ligne n'est pas lue, sinon `ink-muted`. Heure : « 21:14 » aujourd'hui, « HIER », puis « 5 OCT. ». « Tout lire » n'apparaît que s'il y a des notifications ; « Voir plus », bouton discret, sous la liste. Centre vide : « Rien de neuf. »
- Annonce (`docs/ANNONCE.md`) : une ligne du centre comme les autres, icône cloche, « JENTAPP » à la place du nom de la ligue, son texte tel quel. Un appui la marque lue sans ouvrir d'autre page.
- Réglages du compte : les trois niveaux sont des lignes à bouton radio (`brand` pour le choix), comme la page de référence ; l'interrupteur « Notifications push » est masqué sans push (navigateur, clés absentes) ou tant que l'état de l'appareil n'est pas connu.
- Activer les notifications : permission refusée, le message de formulaire « Les notifications sont bloquées. Autorise-les dans les réglages de ton navigateur. » au-dessus du bouton ; iPhone sans l'app installée, bouton inactif et, au-dessus, « Sur iPhone, installe d'abord l'app. » suivi du lien « Installer l'app ». Les points du parcours n'apparaissent que dans le parcours d'inscription.
- Installer l'app : aussi depuis Aide et légal (« Installer l'app »). Onglet présélectionné selon l'appareil (Android hors iPhone). Android : le bouton secondaire « Installer » remplace les étapes ; sans proposition du navigateur, bouton inactif et « Ton navigateur ne propose pas l'installation. Ouvre JentApp dans Chrome. ». Déjà installée : « JentApp est déjà installée. » à la place du sélecteur et des étapes.
- Hors ligne : l'icône de l'app, « Pas de réseau. JentApp revient dès que tu es connecté. », bouton primaire « Réessayer ».
- Maintenance (`deploy/nginx/maintenance.html`, `docs/ANNONCE.md`) : servie par Nginx quand l'app ne répond pas, donc autonome, valeurs des jetons recopiées dans la page. Mise en page de la page hors ligne : l'icône de l'app, « JentApp revient dans un instant. » en `heading`, « Mise à jour en cours. Recharge la page dans une minute. » en `body` `ink-muted`. Pas de bouton.
- Bandeau de validation (`docs/VALIDATION.md`) : en validation seulement, une bande pleine largeur tout en haut de chaque écran, fond `brand`, « VALIDATION » en `overline` `on-brand`, centré. En app installée, la bande remplit aussi la zone de la barre d'état. Le manifeste s'appelle « JentApp validation », nom court « Validation » sous l'icône.
- Feuille « Quoi de neuf » (`docs/VALIDATION.md`) : `BottomSheet` à la première page ouverte après une mise à jour. Sur-titre « NOUVEAUTÉS · 2.1.0 » en `overline` `ink-subtle`, le titre de la note comme titre de feuille, la liste à puces en `body` `ink-muted`, bouton primaire « Compris », puis lien discret « Toutes les nouveautés » centré. Fermée de n'importe quelle façon (bouton, croix, fond), la version est notée lue.
- Journal : jours en overline (« AUJOURD'HUI », « HIER », « LUNDI 5 OCTOBRE »), une carte par jour, l'auteur en gras ; « Voir plus », bouton discret. Journal vide : « Rien au journal pour l'instant. »

Si un cas ne rentre dans aucune de ces lignes, s'arrêter et demander.
