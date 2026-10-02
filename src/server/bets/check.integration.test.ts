import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { bets } from "@/db/schema";
import { findBetDiscrepancies, findDiscrepancies } from "@/server/ledger";
import { at, betWithStakes, CLOSE } from "@/test/bet-scenarios";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { cancelBet } from "./manage";
import { settleDue } from "./payout";
import { resolveBet } from "./result";

const after = (minutes: number) => new Date(CLOSE.getTime() + minutes * 60_000);

describe("contrôle des paris", () => {
  beforeEach(resetDb);

  it("réglé, remboursé ou annulé : aucun écart", async () => {
    const { league, owner, players } = await leagueWith(3);
    const [p1, p2, p3] = [players[0]!, players[1]!, players[2]!];
    const paid = await betWithStakes(league.id, owner, [
      [p1, 0, 7],
      [p2, 0, 3],
      [p3, 1, 5],
    ]);
    const alone = await betWithStakes(league.id, owner, [[p1, 0, 4]]);
    const cancelled = await betWithStakes(league.id, owner, [[p2, 1, 6]]);
    await cancelBet(owner, league.id, cancelled.betId, at(10));
    await resolveBet(owner, league.id, paid.betId, { optionId: paid.options[0]! }, after(1));
    await resolveBet(owner, league.id, alone.betId, { optionId: alone.options[0]! }, after(1));
    await settleDue(league.id, after(11));
    expect(await findBetDiscrepancies(getDb())).toEqual([]);
    expect(await findDiscrepancies(getDb())).toEqual([]);
  });

  it("signale un pari réglé dont les gains ne font pas le pot", async () => {
    const { league, owner, players } = await leagueWith(3);
    const b = await betWithStakes(league.id, owner, [
      [players[0]!, 0, 7],
      [players[1]!, 0, 3],
      [players[2]!, 1, 5],
    ]);
    await resolveBet(owner, league.id, b.betId, { optionId: b.options[0]! }, after(1));
    await settleDue(league.id, after(11));
    // Cagnotte modifiée après coup : le pot ne correspond plus aux gains.
    await getDb().update(bets).set({ seed: 9 }).where(eq(bets.id, b.betId));
    expect(await findBetDiscrepancies(getDb())).toMatchObject([
      { betId: b.betId, problem: "payout", wagered: 15, paid: 20 },
    ]);
  });
});
