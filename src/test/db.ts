import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

// Le catalogue de départ vient de la migration qui le crée : une seule source.
const seed = readFileSync("src/db/migrations/0005_shop_and_achievements.sql", "utf8")
  .split("--> statement-breakpoint")
  .filter((statement) => /^\s*(--.*\n\s*)*INSERT INTO "(cosmetics|achievements)"/.test(statement));

/**
 * Vide les tables métier entre deux tests et remet le catalogue de départ.
 * Les succès sont désactivés : leurs récompenses fausseraient les soldes des
 * autres tests. Les tests de succès les rallument (`enableAchievements`).
 */
export async function resetDb() {
  await getDb().execute(
    sql`truncate table member_achievements, member_cosmetics, achievements, cosmetics, message_mentions, message_reactions, messages, wagers, bet_options, bets, ledger, audit_log, league_members, leagues, rate_limits, verifications, accounts, sessions, users restart identity cascade`,
  );
  for (const statement of seed) await getDb().execute(sql.raw(statement));
  await getDb().execute(sql`update achievements set active = false`);
}

/** Rallume les succès de départ (tests de succès). */
export async function enableAchievements() {
  await getDb().execute(sql`update achievements set active = true`);
}
