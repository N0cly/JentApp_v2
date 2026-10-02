import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

/** Vide les tables métier entre deux tests. */
export async function resetDb() {
  await getDb().execute(
    sql`truncate table wagers, bet_options, bets, ledger, audit_log, league_members, leagues, rate_limits, verifications, accounts, sessions, users restart identity cascade`,
  );
}
