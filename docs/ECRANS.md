# Adaptation aux écrans

**Objectif.** Chaque écran reste utilisable sur tous les téléphones courants, pas seulement à 390 px, la seule largeur vérifiée de M0 à M7.

**Terminé quand** aucun écran ne déborde, ne coupe un texte utile ni ne cache une action, à toutes les tailles du § Tailles et avec les contenus du § Contenus extrêmes.

Tout se vérifie en local. Ne pas toucher à `deploy/`.

## État de départ

La mise en page est fluide : `Screen` prend toute la largeur jusqu'à 480 px, puis se centre. Aucune largeur d'écran n'est codée en dur. Ce qui n'a jamais été vérifié est listé au § Points déjà repérés.

## Tailles

| Appareil type | Largeur × hauteur |
| --- | --- |
| Petit iPhone ancien, petits Android | 320 × 568 |
| Android courant | 360 × 740 |
| iPhone SE, iPhone mini | 375 × 667 |
| iPhone standard | 390 × 844 |
| Grand Android | 412 × 915 |
| iPhone Pro Max | 430 × 932 |
| Tablette ou ordinateur | 820 × 1180 : la colonne de 480 px doit rester centrée |

## Contenus extrêmes

Créer un jeu de données qui pousse chaque limite de la spec :

- Pseudo de 20 caractères, sans espace.
- Nom de ligue de 30 caractères.
- Question de 140 caractères ; 8 options de 40 caractères.
- Solde à cinq chiffres, gain à quatre chiffres, bilan négatif à quatre chiffres.
- Ligue de 50 membres ; joueur dans 10 ligues.
- Message de chat de 500 caractères sans espace, puis avec.
- Liste vide pour chaque écran qui en a une.

## Points déjà repérés

À corriger, puis à vérifier avec le reste.

1. **Bas d'écran sur iPhone.** `viewportFit: cover` est actif, mais seuls `TabBar` et `BottomSheet` tiennent compte de `env(safe-area-inset-bottom)`. Les écrans sans barre d'onglets qui finissent par un bouton (connexion, inscription, création de ligue, nouveau pari, présentation, installer, activer) laissent ce bouton dans la zone de l'indicateur d'accueil. Ajouter la marge de zone sûre à `Screen`, ou à un composant de pied d'écran commun.
2. **Haut d'écran en app installée.** Vérifier qu'aucun en-tête ne passe sous la barre d'état ; ajouter `env(safe-area-inset-top)` si c'est le cas.
3. **Clavier.** Le chat et les formulaires n'ont aucune gestion du clavier virtuel. Vérifier que le champ de saisie reste visible au-dessus du clavier, que l'en-tête ne sort pas de l'écran, et que le bouton primaire d'un formulaire reste atteignable.
4. **Petites largeurs.** Les bulles du chat sont limitées à 270 px en dur. Les grilles à quatre colonnes (`StatGrid`), à trois colonnes (raccourcis du ticket de mise, cosmétiques) et le podium n'ont jamais été vus à 320 px.
5. **Textes longs.** Cinq `truncate` seulement dans tout le code. Décider pour chaque endroit : couper avec des points de suspension (pseudos, noms de ligue dans les en-têtes et les listes) ou passer à la ligne (questions, options, messages).
6. **Paysage.** Rien n'est prévu. Déclarer `orientation: "portrait"` dans le manifeste, et vérifier que l'app reste utilisable si le téléphone tourne quand même.
7. **Hauteur courte.** À 568 et 667 px de haut, les écrans à bouton en bas d'écran et les feuilles (ticket de mise, tournée, GIF) doivent défiler au lieu de couper leur contenu.
8. **Zoom du texte.** Avec le texte du navigateur agrandi à 200 %, rien ne doit se chevaucher ni devenir inatteignable.

## Méthode

1. **Contrôle automatique.** Un script `pnpm test:screens` ouvre chaque route de `docs/design.md` à chaque taille, avec le jeu de données extrême, et échoue si la page défile horizontalement (`scrollWidth > clientWidth`) ou si un élément dépasse du bord droit. Playwright est admis en dépendance de développement pour ce script. Il ne rejoint pas la CI.
2. **Captures.** Le même script enregistre une capture par écran et par taille dans un dossier ignoré par Git, pour une relecture à l'œil.
3. **Corrections.** Une par commit, avec la route et la taille concernées dans le message.
4. **Règle de correction.** On corrige par la mise en page (retour à la ligne, troncature, défilement, `min-w-0`), jamais en réduisant une taille de texte ou une zone d'appui sous 44 px.

## Critères de fin

- [ ] `pnpm test:screens` passe sur toutes les routes, à toutes les tailles.
- [ ] Les huit points du § Points déjà repérés sont traités ou explicitement écartés, avec la raison.
- [ ] Aucune zone d'appui sous 44 px, à 320 px comme à 430 px.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` et `pnpm build` passent.
- [ ] `docs/design.md` reçoit une section « Tailles d'écran » : tailles vérifiées, règles de troncature, zones sûres.
- [ ] Reste à vérifier sur un vrai iPhone et un vrai Android : listé à part, pour la mise en production.

## Consigne pour Claude Code

> Lis `CLAUDE.md`, `docs/design.md` et `docs/ECRANS.md`. Commence par le script `pnpm test:screens` et le jeu de données extrême, lance-le, et montre-moi la liste des écrans en échec avant de corriger quoi que ce soit. Corrige ensuite un problème par commit, sans réduire une taille de texte ni une zone d'appui. Ne touche pas à `deploy/`. Si une correction demande de s'écarter d'une page de `design/screens`, arrête-toi et pose la question. À la fin, coche les critères de fin et liste ce qui ne peut se vérifier que sur un vrai téléphone.