import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkHealth } from "@/server/health";
import { appMeta } from "./schema";

// Parle à un vrai Postgres : celui du compose en local, un service en CI.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquante : lancer `docker compose up -d db`");

const client = postgres(url, { max: 1 });
const db = drizzle(client);
const KEY = "integration-test";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "src/db/migrations" });
});

afterAll(async () => {
  await db.delete(appMeta).where(eq(appMeta.key, KEY));
  await client.end();
});

describe("base Postgres", () => {
  it("applique les migrations et lit ce qu'elle écrit", async () => {
    await db
      .insert(appMeta)
      .values({ key: KEY, value: "1" })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: "1" } });

    const rows = await db.select().from(appMeta).where(eq(appMeta.key, KEY));
    expect(rows).toEqual([{ key: KEY, value: "1" }]);
  });

  it("rend la santé ok", async () => {
    const health = await checkHealth(() => client`select 1`);
    expect(health.body).toEqual({ status: "ok", db: "ok" });
  });
});
