import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export type Discrepancy = { leagueId: string; userId: string; balance: number; journal: number };

/** Membres dont le solde diffère de la somme de leurs lignes de journal. */
// Sans alias d'import : `pnpm ledger:check` charge ce fichier directement avec Node.
export async function findDiscrepancies(
  db: Pick<PostgresJsDatabase<Record<string, unknown>>, "execute">,
): Promise<Discrepancy[]> {
  const rows = await db.execute<{
    league_id: string;
    user_id: string;
    balance: number;
    journal: number;
  }>(sql`
    select m.league_id, m.user_id, m.balance, coalesce(sum(l.delta), 0)::int as journal
    from league_members m
    left join ledger l on l.league_id = m.league_id and l.user_id = m.user_id
    group by m.league_id, m.user_id, m.balance
    having m.balance <> coalesce(sum(l.delta), 0)
    order by m.league_id, m.user_id
  `);
  return rows.map((r) => ({
    leagueId: r.league_id,
    userId: r.user_id,
    balance: r.balance,
    journal: r.journal,
  }));
}

export type BetDiscrepancy = {
  betId: string;
  leagueId: string;
  problem: "payout" | "refund" | "wagers";
  wagered: number;
  paid: number;
  refunded: number;
  seed: number;
};

/**
 * Paris dont le journal ne tombe pas juste : réglé, la somme des gains doit
 * égaler les mises plus la cagnotte ; annulé ou remboursé, la somme des
 * remboursements doit égaler les mises ; et les débits de mise doivent égaler
 * la table wagers.
 */
export async function findBetDiscrepancies(
  db: Pick<PostgresJsDatabase<Record<string, unknown>>, "execute">,
): Promise<BetDiscrepancy[]> {
  const rows = await db.execute<{
    bet_id: string;
    league_id: string;
    problem: BetDiscrepancy["problem"];
    wagered: number;
    paid: number;
    refunded: number;
    seed: number;
  }>(sql`
    with sums as (
      select b.id, b.league_id, b.seed, b.settled_at, b.cancelled_at,
        coalesce(sum(-l.delta) filter (where l.reason = 'wager'), 0)::int as wagered,
        coalesce(sum(l.delta) filter (where l.reason = 'payout'), 0)::int as paid,
        coalesce(sum(l.delta) filter (where l.reason = 'refund'), 0)::int as refunded,
        (select coalesce(sum(w.amount), 0)::int from wagers w where w.bet_id = b.id) as staked
      from bets b
      left join ledger l on l.ref_id = b.id
      group by b.id
    )
    select id as bet_id, league_id, seed, wagered, paid, refunded,
      case
        when wagered <> staked then 'wagers'
        when (cancelled_at is not null or (settled_at is not null and refunded > 0)) and refunded <> wagered then 'refund'
        else 'payout'
      end as problem
    from sums
    where wagered <> staked
      or ((cancelled_at is not null or (settled_at is not null and refunded > 0)) and refunded <> wagered)
      or (settled_at is not null and cancelled_at is null and refunded = 0 and paid <> wagered + seed)
    order by league_id, id
  `);
  return rows.map((r) => ({
    betId: r.bet_id,
    leagueId: r.league_id,
    problem: r.problem,
    wagered: r.wagered,
    paid: r.paid,
    refunded: r.refunded,
    seed: r.seed,
  }));
}
