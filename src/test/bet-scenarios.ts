import { randomUUID } from "node:crypto";
import { createBet, placeWager } from "@/server/bets";
import { optionIds } from "./bets";

export const T0 = new Date("2026-10-07T18:00:00Z");
export const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
/** Les paris de test ferment à T0 + 2 h. */
export const CLOSE = at(120);

/** Crée un pari ouvert à T0 et place les mises : [joueur, index d'option, montant]. */
export async function betWithStakes(
  leagueId: string,
  creator: { id: string },
  stakes: [{ id: string }, number, number][],
  options = ["A", "B", "C"],
) {
  const created = await createBet(
    creator,
    leagueId,
    { question: "Qui gagne la soirée ?", options, moment: "NIGHT", closesAt: CLOSE.toISOString() },
    T0,
  );
  if (!created.ok) throw new Error(JSON.stringify(created));
  const ids = await optionIds(created.betId);
  for (const [user, index, amount] of stakes) {
    const result = await placeWager(
      user,
      leagueId,
      created.betId,
      { optionId: ids[index], amount, ticketId: randomUUID() },
      at(1),
    );
    if (!result.ok) throw new Error(result.error);
  }
  return { betId: created.betId, options: ids };
}
