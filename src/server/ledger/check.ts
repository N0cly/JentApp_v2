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
