# Relecture des textes

Relecture des textes d'interface de M1 à M7, sur le code poussé le 3 octobre 2026. Environ 470 textes relus, extraits automatiquement de `src` ; un texte construit à l'exécution a pu échapper à l'extraction.

Dans l'ensemble, la voix est tenue : tutoiement, phrases courtes, pas d'emoji, messages qui disent quoi faire. Les corrections ci-dessous sont les seules à faire.

## 1. Accords au singulier

Règle : singulier pour 0 et 1, pluriel à partir de 2. Utiliser `countOf` de `src/lib/units.ts` partout où c'est possible.

| Fichier | Aujourd'hui | Attendu |
| --- | --- | --- |
| `components/bets/TicketSheet.tsx` | « Il te manque 6 clope. » : toujours au singulier | « Il te manque 6 clopes. », « Il te manque 1 clope. » |
| `components/stats/StatGrid.tsx` | « 1 paris », « 1 gagnés » | « 1 pari », « 1 gagné » ; « 0 pari », « 0 gagné » |
| `components/league/RoundSheet.tsx` | « clopes par membre », « 1 clopes créées » | « clope par membre » et « 1 clope créée » quand le nombre vaut 1 |
| `components/achievements/AchievementList.tsx` | « 1 succès sur 12 débloqués » | « 1 succès sur 12 débloqué » |
| `components/shop/ShopBoard.tsx` | « Acheter Zinc pour 1 clopes ? » | Accord sur le prix, dans le titre de la feuille et le libellé du bouton |

## 2. Formulations

| Fichier | Aujourd'hui | Attendu |
| --- | --- | --- |
| `components/ranking/RankingBoard.tsx` | « Tu mènes la ligue. 0 clope d'avance sur Bruno. » | À égalité en tête : « Tu partages la tête avec Bruno. » |
| `components/ranking/RankingBoard.tsx` | « 0 clope derrière Bruno » | À égalité plus bas : « À égalité avec Bruno » |
| `components/ranking/RankingBoard.tsx` | « Tu es seul ici. Invite la bande. » | « Personne d'autre ici. Invite la bande. » |
| `lib/notification-text.ts` | « Pari programmé : Qui paie ?. Ouverture à 23:30. » | « Pari programmé, ouverture à 23:30 : Qui paie ? » |
| `lib/notification-text.ts` | « Pari réglé : tu perds 7 clopes » | « Pari réglé : tu perds 7 clopes sur « Qui paie ? » », comme pour un gain |
| `lib/notification-text.ts` | « Pari réglé : ta mise de 7 est rendue » | « Pari réglé : ta mise de 7 est rendue sur « Qui paie ? » » |
| `server/bets/rules.ts` | « Tu as déjà 3 paris en cours. Attends qu'un soit réglé. » | « Tu as déjà 3 paris en cours. Attends que l'un d'eux soit réglé. » |
| `server/bets/rules.ts` | « Ce pari n'accepte pas de mise. » | « Ce pari n'est pas ouvert aux mises. » |
| `app/not-found.tsx` | « Cette page n'existe pas, ou tu n'y as pas accès. Reviens à l'accueil. » | « Cette page n'existe pas, ou tu n'y as pas accès. » Le bouton dit déjà le reste |
| `components/catalog/CatalogBoard.tsx` | Règle « Paris misés » | « Paris joués » |

## 3. Comportement

| Fichier | Aujourd'hui | Attendu |
| --- | --- | --- |
| `server/chat/messages.ts` | « Joueur supprimé rejoint la ligue » | Le message d'arrivée d'un compte supprimé n'est plus affiché |

## 4. Typographie

Les questions des joueurs passent par `frenchSpacing`, mais pas les textes fixes de l'interface : « Mot de passe oublié ? », « Pas encore de compte ? », « QUELLE OPTION A GAGNÉ ? » gardent une espace ordinaire devant le point d'interrogation, qui peut partir seul à la ligne.

- Mettre une espace insécable devant `?`, `!`, `:` et `;` dans les textes fixes.
- Ajouter un test de garde, sur le modèle de celui des couleurs en dur : il échoue si un texte de `src` contient une espace ordinaire devant l'un de ces signes.

## 5. Facultatif

Une formulation des maquettes est au masculin. À changer seulement si tu veux un texte neutre ; il faut alors corriger aussi la page de référence.

| Fichier | Aujourd'hui | Proposition |
| --- | --- | --- |
| `app/(app)/notifications/activer/page.tsx` et `design/screens/activer-les-notifications.html` | « Sois prévenu quand ça se joue » | « Ne rate rien quand ça se joue » |

## Textes relus et gardés tels quels

Signalés « à relire » dans les rapports de jalon, ils sont bons : « Rien ici », « Voir les paris », « Écris quelque chose avant d'envoyer. », « Ce GIF ne vient pas de Giphy. », « Aucun GIF pour cette recherche. », « Aucun pari ouvert à partager. », « Solde après achat », « Aucune bordure en vente pour l'instant. », « Un succès désactivé ne se débloque plus ; ceux qui l'ont le gardent. », « Ton navigateur ne propose pas l'installation. Ouvre JentApp dans Chrome. », les erreurs du formulaire du catalogue, et les messages de validation ajoutés en M3.

## Consigne pour Claude Code

> Lis `docs/TEXTES.md` et applique ses sections 1 à 4, un commit par section. Ne change aucun autre texte. Mets à jour les tests qui citent un texte modifié. La section 5 est facultative : ne l'applique que si je te le demande. À la fin, lance lint, typecheck et tests, et liste ce que tu as changé.