import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// CLAUDE.md, règle 2 : aucun code hors de src/server/ledger n'écrit le solde.
// Les migrations en sont exclues (le rattrapage de M2 y est documenté).
const ALLOWED = [join("src", "server", "ledger") + sep, join("src", "db", "migrations") + sep];

const WRITES: [string, RegExp][] = [
  ["update Drizzle", /\.set\(\s*\{[^}]*\bbalance\s*:/s],
  ["insert Drizzle", /\.values\(\s*[[{][^)]*\bbalance\s*:/s],
  ["conflit Drizzle", /\bset\s*:\s*\{[^}]*\bbalance\s*:/s],
  ["SQL", /\bset\s+"?balance"?\s*=/i],
  ["SQL", /,\s*"?balance"?\s*=\s*"?\w*"?\.?"?balance/i],
];

export function balanceWrites(source: string): string[] {
  return WRITES.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
}

const files = readdirSync(join(process.cwd(), "src"), { recursive: true, encoding: "utf8" })
  .filter((f) => /\.(ts|tsx|sql)$/.test(f))
  .map((f) => relative(process.cwd(), join(process.cwd(), "src", f)))
  .filter((f) => !ALLOWED.some((dir) => f.startsWith(dir)));

describe("garde du solde", () => {
  it("repère les écritures du solde", () => {
    expect(
      balanceWrites(`db.update(leagueMembers).set({ role: "admin", balance: 3 })`),
    ).not.toEqual([]);
    expect(balanceWrites(`db.insert(leagueMembers).values({ leagueId, balance: 10 })`)).not.toEqual(
      [],
    );
    expect(balanceWrites(`.onConflictDoUpdate({ target: x, set: { balance: 1 } })`)).not.toEqual(
      [],
    );
    expect(balanceWrites("sql`update league_members set balance = balance + 1`")).not.toEqual([]);
    expect(
      balanceWrites(`UPDATE "league_members" SET "role" = 'x', "balance" = m."balance" + 5`),
    ).not.toEqual([]);
    expect(balanceWrites(`select({ balance: leagueMembers.balance })`)).toEqual([]);
  });

  it.each(files)("%s n'écrit pas le solde", (file) => {
    expect(balanceWrites(readFileSync(file, "utf8"))).toEqual([]);
  });
});
