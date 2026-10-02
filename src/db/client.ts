import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante");
  const sql = postgres(url, { max: 10 });
  return drizzle(sql, { schema });
}

type Db = ReturnType<typeof createDb>;

// Une seule connexion par processus, y compris entre deux rechargements en dev.
const globalForDb = globalThis as unknown as { db?: Db };

export function getDb(): Db {
  globalForDb.db ??= createDb();
  return globalForDb.db;
}
