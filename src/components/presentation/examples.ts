// Exemples des illustrations de la présentation, repris des maquettes.
// Ce sont des images fixes (aria-hidden), pas des données : rien d'autre ne les lit.
export const examples = {
  question: "Qui s'endort en premier ce soir ?",
  countdown: "01:42:10",
  options: [
    { label: "Paco_Le_Fou", myStake: undefined },
    { label: "Mister_Clope", myStake: 10 },
  ],
  pot: 40,
  payouts: [
    { name: "Nocly", stake: 7, gain: 19 },
    { name: "Mister_Clope", stake: 5, gain: 13 },
    { name: "Jenta_Le_King", stake: 3, gain: 8 },
  ],
  leagues: [
    { name: "Jenta", members: 5, balance: 64, openBets: 2, active: true },
    { name: "Coloc", members: 4, balance: 120, openBets: 1, active: false },
    { name: "Foot du jeudi", members: 11, balance: 35, openBets: 0, active: false },
  ],
} as const;
