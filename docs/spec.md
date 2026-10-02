# JentApp v2 — Spec fonctionnelle et logique

2 octobre 2026 · Enzo BEDOS

## 1. Décisions actées

La v2 est une réécriture complète : nouvelle base, nouvelle stack, plusieurs ligues, pari mutuel. Rien n'est repris du code ni des données de la v1, seulement le produit.

| Sujet | Décision |
| --- | --- |
| Cible | PWA uniquement, pas d'app native |
| Stack | Next.js + Drizzle, réécrit de zéro. React Native est abandonné |
| Hébergement | VPS perso, Docker Compose derrière Nginx |
| Base | Postgres dans le Docker Compose du VPS, schéma neuf, aucune donnée migrée : comptes, soldes et historique repartent de zéro. Neon est écarté |
| Thème | Clopes, joints et paquets conservés |
| Portée | Plusieurs ligues privées ; un utilisateur peut être dans plusieurs ligues |
| Paris | Pari mutuel seul au lancement, à réévaluer à l'usage |
| Admins | Owner et admins jouent comme les autres joueurs, d'où les garde-fous du §9 |
| Ordre de travail | Fonctionnel et logique d'abord (ce document), design ensuite |

## 2. Périmètre v2

Toutes les fonctions de la v1 sont conservées ; ce qui change, c'est qui a le droit de faire quoi et où se fait le calcul. Tout ce qui touche aux clopes passe côté serveur.

| Fonction | v1 (code actuel) | v2 |
| --- | --- | --- |
| Paris | Cotes fixes par option, saisies par l'admin | Pari mutuel : pot partagé entre gagnants, aucune cote à saisir, création ouverte à tous les membres |
| Monnaie | Trois soldes (clopes, joints, paquets) convertis côté client | Un solde entier en clopes par ligue ; joints et paquets servent à l'affichage et aux raccourcis de mise |
| Ligues | Une seule bande | Plusieurs ligues privées, invitation par code |
| Chat | Messages, GIF, mentions, réactions, présence | Identique, un fil par ligue, plus les événements de paris postés automatiquement |
| Boutique | Avatars et bordures, prix en trois monnaies | Catalogue global, prix en clopes, possession par ligue |
| Succès | Débloqués par une fonction SQL appelée par le client | Conservés, évalués côté serveur, par ligue |
| Classement | Top 20 par clopes | Par ligue : fortune et bilan net |
| Admin | Un panel unique pour tout | Réglages de ligue pour l'owner, catalogue pour le super-admin |
| Notifications | In-app et web push | Conservées, réglables par ligue |
| Connexion | Pseudo + mot de passe, faux emails `@jenta.app` | Email + mot de passe, pseudo global unique |

Supprimé en v2 :

- Les conversions manuelles clopes / joints / paquets et les demi-unités.
- Le crédit de clopes à un joueur précis par un admin.
- Les écritures directes du client dans le solde, les rôles et les gains.
- Le bandeau de mise à jour piloté par la table `app_config` ; le service worker gère les nouvelles versions.

Conservé tel quel : les cinq moments (`BEFORE`, `NIGHT`, `AFTER`, `DAILY`, `SPECIAL`) et le pari mystère, dont la question reste cachée jusqu'à l'ouverture.

## 3. Comptes et ligues

Un compte est global ; tout le reste (solde, paris, chat, classement, cosmétiques possédés, rôle) appartient à une ligue.

**Compte**

- Inscription par email + mot de passe, avec un pseudo unique sur toute la plateforme (3 à 20 caractères).
- Réinitialisation du mot de passe par email.
- Photo de profil globale, visible dans toutes les ligues.
- L'email n'est jamais renvoyé aux autres joueurs.

**Ligue**

- Créée par n'importe quel utilisateur, qui en devient l'owner.
- Code d'invitation de 6 caractères, doublé d'un lien `/j/CODE` qui pré-remplit le code. L'owner peut le régénérer, ce qui invalide l'ancien.
- Limites proposées : 10 ligues par utilisateur, 50 membres par ligue.
- La ligue active est portée par l'URL (`/l/{ligue}/paris`), pour qu'une notification ouvre directement la bonne ligue.
- Un membre qui quitte une ligue garde son solde gelé : s'il revient, il le retrouve et ne retouche pas la dotation de départ.

**Rôles par ligue**

| Action | Joueur | Admin | Owner |
| --- | --- | --- | --- |
| Parier, chatter, acheter | oui | oui | oui |
| Créer un pari | oui | oui | oui |
| Saisir le résultat d'un pari | le sien | oui | oui |
| Annuler un pari non réglé | le sien, avant la fermeture | oui | oui |
| Supprimer le message d'un autre | non | oui | oui |
| Tournée générale | non | non | oui |
| Régler la ligue (dotation, allocation, cagnotte) | non | non | oui |
| Nommer un admin, exclure un membre | non | non | oui |
| Régénérer le code, transférer ou supprimer la ligue | non | non | oui |

Un seul owner par ligue. Il ne peut pas la quitter sans la transférer. Le super-admin de la plateforme gère le catalogue de cosmétiques et de succès ; il n'a aucun pouvoir dans une ligue dont il n'est pas membre.

## 4. Économie

Chaque membre a un seul solde entier en clopes par ligue, et ce solde n'est jamais écrit directement : il est la somme des lignes d'un journal de mouvements.

**Unités.** 1 joint = 5 clopes, 1 paquet = 20 clopes. Elles servent à afficher un solde (« 3 paquets · 4 clopes ») et à miser plus vite (+5, +20). Il n'y a plus de demi-clope ni de conversion.

**Les paris ne créent pas de clopes.** Une mise déplace des clopes du joueur vers le pot, un règlement du pot vers les gagnants. La masse d'une ligue ne bouge que par les canaux ci-dessous.

| Canal | Sens | Valeur par défaut proposée | Réglé par |
| --- | --- | --- | --- |
| Dotation de départ | Entrée | 50 clopes, une seule fois par membre et par ligue | Owner |
| Allocation hebdomadaire | Entrée | 10 clopes par semaine | Owner (0 pour couper) |
| Cagnotte de pari | Entrée | 5 clopes ajoutées au pot, sous conditions (§5) | Owner (0 pour couper) |
| Récompense de succès | Entrée | Fixée par succès, une fois par membre et par ligue | Super-admin |
| Tournée générale | Entrée | Montant libre, identique pour tous les membres | Owner, à chaque fois |
| Achat en boutique | Sortie | Prix du cosmétique | Super-admin |

**Allocation hebdomadaire.** Elle est créditée à la première visite du membre dans la semaine (lundi 00:00, heure de Paris), pas par une tâche planifiée. Un membre absent n'accumule rien, ce qui évite que les comptes fantômes gonflent la masse.

**Règles que le serveur garantit**

1. Un solde ne passe jamais sous zéro.
2. Chaque mouvement écrit sa ligne de journal et met à jour le solde dans la même transaction.
3. La somme des lignes de journal d'un membre est toujours égale à son solde.
4. Un crédit automatique (dotation, allocation, succès) ne peut pas être versé deux fois : il porte une clé unique.
5. Au règlement d'un pari, la somme des gains versés est exactement égale au pot.

## 5. Paris en mutuel

Un pari est une question avec 2 à 8 options ; toutes les mises forment un pot que les gagnants se partagent au prorata de leur mise.

**Création et résolution**

- Tout membre de la ligue peut créer un pari : question, 2 à 8 options, moment, dates d'ouverture et de fermeture, question cachée ou non jusqu'à l'ouverture.
- Un membre ne peut pas avoir plus de 3 paris non réglés à la fois ; admins et owner n'ont pas de plafond.
- Le créateur peut modifier son pari tant que personne n'a misé, et l'annuler avant la fermeture.
- Seuls le créateur, les admins et l'owner peuvent saisir le résultat, une fois le pari fermé.

**Cycle de vie**

```
Programmé ──ouverture──▶ Ouvert ──fermeture──▶ Fermé ──résultat saisi──▶ Réglé
    │                       │                    │
    └──────────────┬────────┴────────────────────┘
                   ▼
                Annulé
```

| État | Ce qui s'y passe | Sortie |
| --- | --- | --- |
| Programmé | Pas encore de mises | Ouverture (`opens_at`), ou annulation |
| Ouvert | Mises acceptées | Fermeture (`closes_at`), ou annulation |
| Fermé | Répartition révélée | Résultat saisi puis versement 10 minutes plus tard, ou annulation, ou 7 jours sans résultat |
| Réglé | Gains versés | État final |
| Annulé | Toutes les mises sont rendues | État final |

Un pari non réglé peut toujours être annulé et remboursé.

L'état se déduit des dates et du résultat, sans tâche planifiée. Un pari fermé depuis 7 jours sans résultat est annulé automatiquement, pour ne pas bloquer les mises.

**Règles de mise**

- Mise entière, de 1 clope jusqu'au solde. La mise est débitée tout de suite.
- Une seule option par joueur et par pari. On peut augmenter sa mise jusqu'à la fermeture, pas la réduire ni changer d'option.
- Tant que le pari est ouvert, chacun voit le pot total et le nombre de parieurs. La répartition par option et le choix des autres restent cachés jusqu'à la fermeture.
- Celui qui crée ou résout un pari peut miser dessus comme les autres ; son nom est affiché sur le pari.

**Délai avant versement**

Quand le résultat est saisi, il est annoncé tout de suite, mais les gains ne sont versés que 10 minutes plus tard.

- Pendant ce délai, celui qui a saisi le résultat, un admin ou l'owner peut le corriger, ce qui relance les 10 minutes.
- Un admin ou l'owner peut aussi annuler le pari : tout le monde est remboursé.
- Passé le délai, le résultat est définitif.
- Le versement se fait à la première lecture de la ligue après l'échéance, sans tâche planifiée.

**Règlement**

1. Pot = somme des mises + cagnotte éventuelle.
2. Chaque gagnant reçoit la partie entière de `pot × sa mise ÷ total misé sur l'option gagnante`.
3. Les clopes restantes sont distribuées une par une aux gagnants qui ont le plus gros reste décimal ; à égalité, la plus grosse mise, puis la plus ancienne.
4. La cote finale affichée est `pot ÷ total misé sur l'option gagnante`, arrondie à deux décimales.

Exemple : 15 clopes sur A (mises de 7, 5 et 3), 12 sur B, 8 sur C, cagnotte de 5, donc un pot de 40. A gagne. Les parts brutes sont 18,67, 13,33 et 8 ; les parties entières font 39, la clope restante va au plus gros reste. Gains : 19, 13 et 8, cote finale x2.67.

**Cas limites**

| Situation | Résultat |
| --- | --- |
| Personne n'a misé sur l'option gagnante | Toutes les mises sont rendues |
| Tout le monde a misé sur l'option gagnante | Toutes les mises sont rendues, gain nul |
| Un seul parieur | Sa mise est rendue |
| Pari annulé (créateur avant la fermeture, admin, owner, ou 7 jours sans résultat) | Toutes les mises sont rendues |
| Résultat saisi par erreur | Corrigeable pendant 10 minutes, définitif ensuite |

**Cagnotte**

La cagnotte n'est ajoutée au pot que si au moins 3 joueurs ont misé et qu'au moins 2 options ont reçu une mise, et sur 5 paris par semaine au plus. Sans ces conditions, un joueur pourrait créer des paris sans enjeu pour se servir. Conséquence assumée : quand tout le monde mise du même côté, il n'y a rien à gagner.

## 6. Chat et temps réel

Chaque ligue a un seul fil de discussion, et un seul flux temps réel par joueur connecté porte à la fois le chat et les paris.

**Messages**

- Texte jusqu'à 500 caractères, GIF, mention d'un membre (`@pseudo`), partage d'un pari sous forme de ticket.
- Réactions par emoji, une par joueur et par emoji.
- Chacun peut supprimer ses messages ; admins et owner peuvent supprimer ceux des autres.
- La recherche de GIF passe par le serveur : la clé Giphy ne sort plus dans le navigateur.
- Chargement des 50 derniers messages, puis par pages en remontant.

**Messages automatiques.** Le serveur poste dans le fil : nouveau pari ouvert, pari réglé (gagnants et cote finale), pari annulé, tournée générale, arrivée d'un membre.

**Temps réel**

- Un flux SSE par joueur et par ligue, ouvert tant que l'app est au premier plan.
- Événements : message, réaction, suppression, pari créé, pot mis à jour, pari fermé, pari réglé, solde, présence, « écrit… ».
- Côté serveur, chaque écriture émet un `NOTIFY` Postgres ; l'app garde une seule connexion `LISTEN` et redistribue aux flux ouverts.
- Présence et « écrit… » restent en mémoire dans le processus, sans passer par la base.
- À la reconnexion, le client redemande ce qu'il a manqué depuis le dernier identifiant reçu.

Ce montage suppose une seule instance de l'app, ce qui suffit pour un VPS.

## 7. Boutique, cosmétiques et succès

Le catalogue est le même pour toute la plateforme, mais ce qu'un joueur possède et porte se décide ligue par ligue.

- **Catalogue.** Avatars et bordures, gérés par le super-admin : nom, image, couleur de bordure, prix en clopes, actif ou non, ordre d'affichage.
- **Achat.** Il débite le solde de la ligue active et vaut pour cette ligue seulement. Sans cette règle, il suffirait de créer une ligue solo, de s'y servir en clopes et de tout acheter.
- **Équipement.** Un avatar et une bordure portés par ligue. La photo de profil importée reste globale et sert par défaut.
- **Succès.** Les définitions sont globales (clé, nom, condition, récompense, caché ou non). La progression et le déblocage sont par ligue, évalués par le serveur après une mise, un règlement ou un achat. La récompense est créditée automatiquement, une seule fois.

## 8. Classement et statistiques

Le classement est propre à chaque ligue et se lit de deux façons : la fortune et le bilan net.

- **Fortune** : solde actuel. Simple, mais il récompense aussi l'ancienneté, puisque l'allocation s'accumule.
- **Bilan net** : gains moins mises sur les paris réglés. C'est la vraie mesure de qui parie bien ; les paris remboursés comptent pour zéro.
- **Profil d'un membre** : paris joués, gagnés, taux de réussite, bilan net, plus gros gain, historique des paris.
- Seuls les membres d'une ligue voient son classement et ses profils. L'API ne renvoie que le pseudo, l'avatar et les chiffres.

## 9. Administration et garde-fous

Comme l'owner et les admins jouent aussi, aucun de leurs pouvoirs ne doit pouvoir avantager un joueur précis sans que toute la ligue le voie.

1. **Pas de crédit individuel.** La seule création de clopes à la main est la tournée générale : le même montant pour tous les membres.
2. **Cagnotte automatique.** Son montant est un réglage de ligue, identique pour tous les paris, avec les conditions du §5. Personne ne la choisit pari par pari.
3. **Résolution publique.** Seuls le créateur du pari, les admins et l'owner peuvent saisir le résultat ; il est annoncé dans le chat avec le nom de celui qui l'a saisi.
4. **Annulation.** Le créateur peut annuler son pari avant la fermeture. Un admin ou l'owner peut annuler un pari tant qu'il n'est pas réglé ; tout le monde est remboursé.
5. **Réglages non rétroactifs.** Un changement de dotation, d'allocation ou de cagnotte ne vaut que pour la suite.

**Journal de la ligue.** Il est lisible par tous les membres, depuis les réglages de la ligue. Il enregistre, avec l'auteur et l'heure : création, résolution et annulation d'un pari, tournée générale, changement de réglage, changement de rôle, exclusion, régénération du code, transfert de la ligue.

**Réglages de ligue (owner).** Nom, dotation de départ, allocation hebdomadaire, montant de la cagnotte, code d'invitation, liste des membres et de leurs rôles.

## 10. Notifications

Les notifications existent sous deux formes, un centre dans l'app et le push web, et se règlent ligue par ligue.

| Événement | Destinataires |
| --- | --- |
| Nouveau pari ouvert | Tous les membres de la ligue |
| Résultat saisi (versement 10 minutes plus tard) : gagné, perdu ou remboursé | Les parieurs de ce pari |
| Pari annulé | Les parieurs de ce pari |
| Mention dans le chat | Le membre mentionné |
| Tournée générale | Tous les membres de la ligue |

- Réglage par ligue : tout, seulement résultats et mentions, ou rien.
- Une notification ouvre la bonne ligue sur le bon pari ou le bon message.
- Le push passe par le protocole Web Push avec des clés VAPID propres à l'app. Sur iPhone, il ne fonctionne que si la PWA est installée sur l'écran d'accueil.
- Pas de rappel « ferme bientôt » en v1 : il demanderait une tâche planifiée.

## 11. Modèle de données

Le schéma repart de zéro et tient en 18 tables ; toute table liée à une ligue porte un `league_id`, et l'appartenance à la ligue est vérifiée par le serveur à chaque requête.

| Table | Rôle | Colonnes clés |
| --- | --- | --- |
| `users` | Compte global | `id`, `email` unique, `password_hash`, `username` unique, `avatar_url`, `is_super_admin` |
| `sessions` | Sessions de connexion | Selon la librairie d'auth retenue |
| `leagues` | Ligue et ses réglages | `id`, `name`, `invite_code` unique, `owner_id`, `join_grant`, `weekly_grant`, `seed_amount` |
| `league_members` | Appartenance, rôle, solde | Clé (`league_id`, `user_id`), `role`, `balance` ≥ 0, `joined_at`, `left_at`, avatar et bordure équipés |
| `ledger` | Journal des mouvements de clopes | `league_id`, `user_id`, `delta`, `reason`, `ref_id`, clé d'unicité pour les crédits automatiques |
| `bets` | Pari | `league_id`, `created_by`, `question`, `moment`, `hidden_until_open`, `opens_at`, `closes_at`, `seed`, `winning_option_id`, `settled_at`, `settled_by`, `cancelled_at` |
| `bet_options` | Options d'un pari | `bet_id`, `label`, `position` |
| `wagers` | Mise d'un joueur sur un pari | Clé (`bet_id`, `user_id`), `option_id`, `amount`, `payout` |
| `messages` | Message du chat | `league_id`, `user_id` (vide pour un message automatique), `kind`, `body`, `gif_url`, `bet_id`, `deleted_at` |
| `message_reactions` | Réactions | Clé (`message_id`, `user_id`, `emoji`) |
| `message_mentions` | Membres mentionnés | Clé (`message_id`, `user_id`) |
| `cosmetics` | Catalogue global | `type`, `name`, `image_url`, `tint_color`, `price`, `active`, `position` |
| `member_cosmetics` | Cosmétiques possédés | Clé (`league_id`, `user_id`, `cosmetic_id`) |
| `achievements` | Définitions des succès | `key` unique, `name`, `rule_type`, `rule_value`, `reward`, `hidden` |
| `member_achievements` | Succès débloqués | Clé (`league_id`, `user_id`, `achievement_id`), `unlocked_at` |
| `notifications` | Centre de notifications | `user_id`, `league_id`, `type`, `payload`, `read_at` |
| `push_subscriptions` | Abonnements Web Push | `user_id`, `endpoint` unique, clés |
| `audit_log` | Journal de la ligue | `league_id`, `actor_id`, `action`, `details`, `created_at` |

Choix à retenir :

- Le solde est stocké dans `league_members.balance` pour la lecture, mais seul le code qui écrit dans `ledger` a le droit de le modifier.
- L'état d'un pari n'est pas stocké : il se calcule à partir de `opens_at`, `closes_at`, `settled_at` et `cancelled_at`.
- Une mise est une seule ligne par joueur et par pari, mise à jour quand il augmente sa mise.
- Miser et régler se font dans une transaction qui verrouille les lignes concernées, pour qu'un double clic ou deux admins simultanés ne paient pas deux fois.

Le délai de 10 minutes ajoute deux colonnes à `bets`, `resolved_at` et `resolved_by` : le résultat est saisi à `resolved_at`, et `settled_at` n'est renseigné qu'au versement des gains, à la première lecture après `resolved_at` + 10 minutes.

## 12. Architecture et hébergement

L'app tient dans un seul conteneur Next.js sur le VPS, derrière le Nginx existant, avec Postgres comme seule autre brique à faire tourner.

```
Navigateur (PWA) ──HTTPS──▶ Nginx ──▶ App Next.js ──▶ Postgres
                                          │
                                          ├──▶ Volume de fichiers
                                          └──appels sortants──▶ Services de push, Giphy, Emails
```

Un seul conteneur applicatif entre le navigateur et Postgres.

| Brique | Où | Rôle |
| --- | --- | --- |
| Navigateur (PWA) | Appareil du joueur | Service worker, push, flux SSE |
| Nginx | VPS | TLS, certificats, proxy vers Next.js |
| App Next.js | VPS · Docker Compose | Pages, logique serveur, clopes, flux SSE, envoi du push |
| Postgres | VPS · Docker Compose | Données, journal, `LISTEN` / `NOTIFY` |
| Volume de fichiers | VPS · Docker Compose | Avatars, cosmétiques |
| Services de push | Externe (Apple, Google, Mozilla) | Acheminement des notifications |
| Giphy | Externe | Recherche de GIF |
| Emails | Externe | Confirmation et mot de passe oublié |

- **App.** Next.js : pages, logique serveur (actions et routes), flux SSE, envoi du push. Drizzle pour le schéma et les migrations.
- **Auth.** Sessions stockées en base, cookie `httpOnly`. Librairie : Better Auth, que l'équipe d'Auth.js recommande désormais pour les nouveaux projets ; elle sera branchée en M1.
- **Fichiers.** Avatars et images de cosmétiques dans un volume Docker, redimensionnés à l'envoi, inclus dans la sauvegarde du VPS.
- **Emails.** Un service d'envoi transactionnel pour la réinitialisation du mot de passe.
- **PWA.** Manifeste, service worker pour l'installation, le cache de la coquille et la réception du push.
- **Secrets.** Uniquement dans les variables d'environnement du serveur. Le `.env` ne revient plus dans le dépôt, et la clé Giphy actuelle est à régénérer puisqu'elle y a été publiée.
- **Déploiement.** Image construite en CI, `docker compose up` sur le VPS, migrations Drizzle au démarrage. Ajout du service au dashboard Homepage.

## 13. Jalons

Huit jalons, chacun livrable et testable seul ; l'argent (M2 et M3) passe avant tout ce qui est confort.

1. **M0 — Socle.** Dépôt N0cly/JentApp_v2 : Next.js, Drizzle, Postgres, Docker Compose, CI, `CLAUDE.md`, jetons du design system. Terminé quand une page vide se déploie sur le VPS.
2. **M1 — Comptes et ligues.** Inscription, connexion, réinitialisation, création d'une ligue, invitation par code, changement de ligue, rôles. Terminé quand deux comptes cohabitent dans deux ligues.
3. **M2 — Économie.** Journal des mouvements, dotation de départ, allocation hebdomadaire, tournée générale, affichage du solde. Terminé quand les cinq règles du §4 sont couvertes par des tests.
4. **M3 — Paris.** Création, mise, fermeture, règlement mutuel, délai de correction de 10 minutes, annulation, cagnotte, pari mystère. Terminé quand chaque cas limite du §5 a son test, arrondis compris.
5. **M4 — Chat et temps réel.** Flux SSE, messages, mentions, réactions, GIF, messages automatiques, présence. Terminé quand un pari réglé apparaît en direct chez un autre joueur.
6. **M5 — Classement et profil.** Fortune, bilan net, statistiques, historique.
7. **M6 — Boutique et succès.** Catalogue, achat, équipement par ligue, succès et récompenses, écran super-admin.
8. **M7 — Notifications et mise en production.** Centre de notifications, push, installation PWA, journal de la ligue, ouverture à la bande.

## 14. Points validés

Tous les points ouverts ont été validés le 2 octobre 2026. Un seul s'écarte de la proposition initiale : la création des paris, ouverte à tous. Les décisions prises ensuite sont au §15.

- [x] **Base.** Postgres dans le Docker Compose du VPS ; Neon est écarté.
- [x] **Stack.** Next.js + Drizzle, réécriture complète, dans le dépôt N0cly/JentApp_v2.
- [x] **Valeurs de l'économie.** Dotation 50, allocation 10 par semaine, cagnotte 5, cinq paris dotés par semaine.
- [x] **Qui crée les paris.** Tous les membres, dès la v1. Seuls le créateur, les admins et l'owner saisissent le résultat.
- [x] **Résultat saisi par erreur.** Corrigeable pendant 10 minutes : les gains ne sont versés qu'après ce délai, puis le résultat est définitif.
- [x] **Limites.** 10 ligues par utilisateur, 50 membres par ligue, 8 options par pari.
- [x] **Plafond de paris.** 3 paris non réglés à la fois par membre ; admins et owner sans plafond.

## 15. Compléments validés

Ces règles complètent les sections précédentes ; en cas de contradiction, ce sont elles qui s'appliquent.

**Comptes (M1)**

- **Email.** Un lien de confirmation part à l'inscription, mais le compte est utilisable tout de suite. Un rappel reste affiché tant que l'email n'est pas confirmé.
- **Âge.** Une case « J'ai 18 ans ou plus » est obligatoire à l'inscription, avec l'acceptation des conditions d'utilisation.
- **Limitation des tentatives** (valeurs proposées). Connexion : 5 essais par quart d'heure, par email et par adresse IP. Inscription : 5 comptes par heure et par adresse IP. Réinitialisation : 3 demandes par heure et par email. Code d'invitation : 10 essais par heure et par compte.
- **Emails.** Deux emails transactionnels : confirmation et réinitialisation du mot de passe. Il faut un service d'envoi et les enregistrements SPF et DKIM du domaine.
- **Pages légales.** Conditions d'utilisation, politique de confidentialité, mentions légales. Elles sont lisibles sans compte et depuis les réglages.

**Suppression de compte (M1)**

1. Elle se fait depuis les réglages, en écrivant son pseudo pour confirmer.
2. Elle est bloquée tant que l'utilisateur est owner d'une ligue qui a d'autres membres : il doit la transférer ou la supprimer. Une ligue dont il est le seul membre disparaît avec le compte.
3. Sont effacés : email, mot de passe, photo, sessions, abonnements aux notifications, messages du chat.
4. Le pseudo devient « Joueur supprimé » partout où il apparaissait.
5. Sont conservés, sans son nom : mises, gains, lignes du journal. Sans eux, les soldes des autres ne seraient plus justifiables.

**Garde-fou : les clopes n'ont aucune valeur réelle.** Elles ne s'achètent pas, ne se vendent pas, ne se convertissent pas et ne donnent droit à aucun lot. Aucune évolution ne doit y toucher : c'est ce qui sépare ce jeu d'un jeu d'argent.

**Paris (M3)**

- **Égalité.** Un pari n'a qu'une option gagnante. En cas d'égalité ou de résultat indécidable, le pari est annulé et les mises sont rendues.
- **Membre qui part.** S'il quitte la ligue ou supprime son compte, ses mises en cours restent dans les pots ; si son option gagne, sa part va sur son solde gelé. Les paris qu'il a créés sont résolus par un admin ou l'owner, ou annulés au bout de 7 jours.

**Cosmétiques (M6)**

Un cosmétique désactivé par le super-admin disparaît de la boutique. Ceux qui le possèdent le gardent et peuvent toujours le porter.

**Présentation et installation**

- **Présentation (M1).** Trois écrans après l'inscription : miser, le partage du pot, les ligues. On peut la passer, et la revoir depuis « Aide et légal ».
- **Installation (M7).** Un écran explique comment mettre l'app sur l'écran d'accueil : trois étapes sur iPhone, un bouton sur Android. Il est proposé après la présentation.
- **Notifications (M7).** La permission n'est demandée qu'après un écran qui explique à quoi elle sert, jamais au premier lancement.

**Mise en production (M7)**

- **Icône.** Celle de `design/icon` : un ticket, le J, une barre de laiton.
- **Sauvegarde** (valeurs proposées). Un `pg_dump` par jour, gardé 14 jours, dans un volume couvert par la sauvegarde hors site du VPS. Une restauration est testée une fois avant l'ouverture.
- **Suivi des erreurs.** Journaux structurés, plus un outil de suivi d'erreurs côté serveur et côté navigateur.
- **Extinction de la v1.** Prévenir la bande que les comptes sont à recréer et que les soldes repartent de zéro, fermer Vercel et Supabase, régénérer la clé Giphy.