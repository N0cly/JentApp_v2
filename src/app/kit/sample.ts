// Données d'exemple du kit, reprises des pages de design/screens.
// Elles ne servent qu'ici : aucun écran ne doit les reprendre.
export const sample = {
  league: "Jenta",
  leagues: [
    { name: "Jenta", members: 5, balance: 64, open: "2 paris ouverts", active: true },
    { name: "Coloc", members: 4, balance: 120, open: "1 pari ouvert", active: false },
    { name: "Foot du jeudi", members: 11, balance: 35, open: "rien d'ouvert", active: false },
  ],
  question: "Qui s'endort en premier ce soir ?",
  creator: "Paco_Le_Fou",
  options: ["Paco_Le_Fou", "Mister_Clope", "La_Dèche"],
  pot: 35,
  bettors: 4,
  myStake: 10,
  balance: 64,
  players: [
    { name: "Jenta_Le_King", ring: "var(--brand)" },
    { name: "Paco_Le_Fou", ring: "var(--ink-muted)" },
    { name: "Nocly", ring: undefined },
  ],
} as const;
