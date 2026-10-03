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

export type ShopDiscrepancy = {
  leagueId: string;
  userId: string;
  ref: string;
  problem: "purchase" | "achievement";
  detail: string;
};

/**
 * Boutique et succès (M6) : chaque achat payant a sa ligne `purchase` au prix
 * payé, et chaque ligne `purchase` son achat ; chaque ligne `achievement` a son
 * succès débloqué, et une récompense positive. Les comptes supprimés gardent
 * leurs lignes sans leurs possessions : ils sont ignorés.
 */
export async function findShopDiscrepancies(
  db: Pick<PostgresJsDatabase<Record<string, unknown>>, "execute">,
): Promise<ShopDiscrepancy[]> {
  const rows = await db.execute<{
    league_id: string;
    user_id: string;
    ref: string;
    problem: ShopDiscrepancy["problem"];
    detail: string;
  }>(sql`
    with purchases as (
      select league_id, user_id, ref_id, sum(-delta)::int as paid, count(*)::int as lines
      from ledger where reason = 'purchase'
      group by league_id, user_id, ref_id
    )
    select mc.league_id, mc.user_id, mc.cosmetic_id::text as ref, 'purchase' as problem,
      'achat à ' || mc.price_paid || ', journal ' || coalesce(p.paid, 0) as detail
    from member_cosmetics mc
    left join purchases p
      on p.league_id = mc.league_id and p.user_id = mc.user_id and p.ref_id = mc.cosmetic_id
    where (mc.price_paid > 0 or p.lines is not null)
      and (coalesce(p.paid, 0) <> mc.price_paid or coalesce(p.lines, 0) <> 1)
    union all
    select p.league_id, p.user_id, p.ref_id::text, 'purchase', 'ligne sans achat'
    from purchases p
    join users u on u.id = p.user_id and u.deleted_at is null
    where not exists (
      select 1 from member_cosmetics mc
      where mc.league_id = p.league_id and mc.user_id = p.user_id and mc.cosmetic_id = p.ref_id
    )
    union all
    select l.league_id, l.user_id, l.ref_id::text, 'achievement',
      case when l.delta <= 0 then 'récompense ' || l.delta else 'ligne sans succès débloqué' end
    from ledger l
    join users u on u.id = l.user_id and u.deleted_at is null
    where l.reason = 'achievement'
      and (l.delta <= 0 or not exists (
        select 1 from member_achievements ma
        where ma.league_id = l.league_id and ma.user_id = l.user_id and ma.achievement_id = l.ref_id
      ))
    order by 1, 2, 3
  `);
  return rows.map((r) => ({
    leagueId: r.league_id,
    userId: r.user_id,
    ref: r.ref,
    problem: r.problem,
    detail: r.detail,
  }));
}
