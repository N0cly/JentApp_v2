// Contrôle du journal : pour chaque membre de chaque ligue, la somme de ses
// lignes doit égaler son solde. Usage : pnpm ledger:check
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { findBetDiscrepancies, findDiscrepancies } from "../src/server/ledger/check.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquante");
  process.exit(1);
}

const client = postgres(url, { max: 1 });
try {
  const db = drizzle(client);
  const discrepancies = await findDiscrepancies(db);
  const betIssues = await findBetDiscrepancies(db);
  if (discrepancies.length === 0 && betIssues.length === 0) {
    console.log("Journal conforme : aucun écart.");
  }
  if (betIssues.length > 0) {
    console.error(`${betIssues.length} pari(s) dont le journal ne tombe pas juste :`);
    for (const b of betIssues) {
      console.error(
        `  pari ${b.betId} · ${b.problem} · mises ${b.wagered} · gains ${b.paid} · rendus ${b.refunded} · cagnotte ${b.seed}`,
      );
    }
    process.exitCode = 1;
  }
  if (discrepancies.length > 0) {
    console.error(`${discrepancies.length} écart(s) entre solde et journal :`);
    for (const d of discrepancies) {
      console.error(
        `  ligue ${d.leagueId} · membre ${d.userId} · solde ${d.balance} · journal ${d.journal} · écart ${d.balance - d.journal}`,
      );
    }
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
