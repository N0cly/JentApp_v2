import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Les tests d'intégration tournent sur une base dédiée, `<base>_test`, dans le
// même Postgres (compose en local, service en CI) : les données de dev restent.
export default async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante : lancer `docker compose up -d db`");

  const testUrl = new URL(url);
  const name = `${testUrl.pathname.slice(1)}_test`;
  testUrl.pathname = `/${name}`;

  const admin = postgres(url, { max: 1, onnotice: () => {} });
  const [exists] = await admin`select 1 from pg_database where datname = ${name}`;
  if (!exists) await admin.unsafe(`create database "${name}"`);
  await admin.end();

  const client = postgres(testUrl.toString(), { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "src/db/migrations" });
  await client.end();

  process.env.DATABASE_URL = testUrl.toString();
}
