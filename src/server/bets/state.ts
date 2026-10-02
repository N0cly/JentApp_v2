export type BetState = "scheduled" | "open" | "closed" | "resolved" | "settled" | "cancelled";

export type BetTimes = {
  opensAt: Date;
  closesAt: Date;
  resolvedAt: Date | null;
  settledAt: Date | null;
  cancelledAt: Date | null;
};

/** État d'un pari, déduit de ses dates : jamais stocké. L'heure du serveur fait foi. */
export function betState(bet: BetTimes, now: Date): BetState {
  if (bet.cancelledAt) return "cancelled";
  if (bet.settledAt) return "settled";
  if (bet.resolvedAt) return "resolved";
  if (now < bet.opensAt) return "scheduled";
  if (now < bet.closesAt) return "open";
  return "closed";
}
