// Règlement d'un pari mutuel (spec §5, docs/M3.md § Règlement). Pur : aucun
// accès à la base. Que des entiers.

export type Stake = { userId: string; optionId: string; amount: number; createdAt: Date };

export type Settlement =
  | { kind: "refund"; payouts: Map<string, number> }
  | {
      kind: "payout";
      pot: number;
      /** Gain de chaque joueur, perdants à 0. */
      payouts: Map<string, number>;
      /** Cote finale en centièmes (267 pour x2.67), pour l'affichage seulement. */
      oddsCents: number;
    };

/**
 * Aucun gagnant ou aucun perdant (un seul parieur compris) : chacun reprend sa
 * mise. `winning` est le total misé sur l'option gagnante, `total` le pot hors
 * cagnotte. Le remboursement se lit au pari, jamais à la mise.
 */
export function isRefund(winning: number, total: number): boolean {
  return winning === 0 || winning === total;
}

export function settle({
  stakes,
  winningOptionId,
  seed,
}: {
  stakes: Stake[];
  winningOptionId: string;
  seed: number;
}): Settlement {
  const total = stakes.reduce((sum, s) => sum + s.amount, 0);
  const winners = stakes.filter((s) => s.optionId === winningOptionId);
  const winning = winners.reduce((sum, s) => sum + s.amount, 0);

  if (isRefund(winning, total)) {
    return { kind: "refund", payouts: new Map(stakes.map((s) => [s.userId, s.amount])) };
  }

  const pot = total + seed;
  const payouts = new Map(stakes.map((s) => [s.userId, 0]));
  const shares = winners.map((s) => ({
    stake: s,
    whole: Math.floor((pot * s.amount) / winning),
    remainder: (pot * s.amount) % winning,
  }));
  for (const share of shares) payouts.set(share.stake.userId, share.whole);

  // Les clopes restantes, une par une : plus grand reste, puis plus grosse mise,
  // puis mise la plus ancienne, puis user_id.
  let left = pot - shares.reduce((sum, s) => sum + s.whole, 0);
  const order = [...shares].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      b.stake.amount - a.stake.amount ||
      a.stake.createdAt.getTime() - b.stake.createdAt.getTime() ||
      (a.stake.userId < b.stake.userId ? -1 : a.stake.userId > b.stake.userId ? 1 : 0),
  );
  for (const share of order) {
    if (left === 0) break;
    payouts.set(share.stake.userId, payouts.get(share.stake.userId)! + 1);
    left -= 1;
  }

  // pot ÷ W arrondi à deux décimales, en centièmes entiers (arrondi au plus proche).
  const oddsCents = Math.floor((pot * 200 + winning) / (2 * winning));
  return { kind: "payout", pot, payouts, oddsCents };
}

/** « x2.67 » à partir de centièmes. */
export function formatOdds(cents: number): string {
  return `x${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
