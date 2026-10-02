// Applique les migrations de src/db/migrations.
// Lancé par `pnpm db:migrate` et au démarrage du conteneur.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquante");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  await migrate(drizzle(sql), {
    migrationsFolder: new URL("./migrations", import.meta.url).pathname,
  });
  console.log("Migrations appliquées");
} finally {
  await sql.end();
}
