// Au démarrage du conteneur, applique les migrations avant de servir.
// Activé par MIGRATE_ON_START dans le Dockerfile ; en dev, `pnpm db:migrate`.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.MIGRATE_ON_START !== "true") return;

  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { default: postgres } = await import("postgres");
  const path = await import("node:path");

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante");

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), {
      migrationsFolder: path.join(process.cwd(), "db/migrations"),
    });
    console.log("Migrations appliquées");
  } catch (error) {
    console.error("Échec des migrations", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}
