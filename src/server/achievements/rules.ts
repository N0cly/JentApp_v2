// Règles des succès (docs/M6.md, § Succès). Pur : aucun accès à la base.

export const RULE_TYPES = [
  "wagers_count",
  "single_stake",
  "all_in",
  "wins_count",
  "win_streak",
  "broke",
  "bets_created",
  "purchases_count",
] as const;

export type RuleType = (typeof RULE_TYPES)[number];

/** Règles qui portent un seuil (toutes sauf « broke »). */
export function needsValue(rule: RuleType): boolean {
  return rule !== "broke";
}

/** Règles qui affichent une progression « {x} sur {n} ». */
export function hasProgress(rule: RuleType): boolean {
  return (
    rule === "wagers_count" ||
    rule === "wins_count" ||
    rule === "win_streak" ||
    rule === "bets_created" ||
    rule === "purchases_count"
  );
}

/** « une clope », « un paquet », sinon « {n} clopes ». */
function clopes(n: number): string {
  if (n === 1) return "une clope";
  if (n === 20) return "un paquet";
  return `${n} clopes`;
}

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/** Description affichée, construite depuis la règle : jamais de texte libre. */
export function describeRule(rule: RuleType, n: number | null): string {
  const v = n ?? 0;
  switch (rule) {
    case "wagers_count":
      return `Miser sur ${count(v, "un pari", "paris")}`;
    case "single_stake":
      return `Miser ${clopes(v)} d'un coup`;
    case "all_in":
      return `Faire tapis avec ${clopes(v)} ou plus`;
    case "wins_count":
      return `Gagner ${count(v, "un pari", "paris")}`;
    case "win_streak":
      return `Gagner ${count(v, "un pari", "paris")} d'affilée`;
    case "broke":
      return "Finir à sec après un pari perdu";
    case "bets_created":
      return `Lancer ${count(v, "un pari", "paris")}`;
    case "purchases_count":
      return `Acheter ${count(v, "un cosmétique", "cosmétiques")}`;
  }
}

/**
 * Série en cours : paris gagnés d'affilée en partant du plus récent. Un pari
 * remboursé ne compte ni ne casse la série ; un pari perdu l'arrête.
 */
export function currentStreak(
  stakes: { settledAt: Date; betId: string; won: boolean; refund: boolean }[],
): number {
  const ordered = [...stakes].sort(
    (a, b) => b.settledAt.getTime() - a.settledAt.getTime() || (a.betId < b.betId ? 1 : -1),
  );
  let streak = 0;
  for (const stake of ordered) {
    if (stake.refund) continue;
    if (!stake.won) break;
    streak += 1;
  }
  return streak;
}
