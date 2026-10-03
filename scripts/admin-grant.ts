// Donne le droit super-admin à un compte (docs/M6.md) : jamais depuis l'interface.
// Usage : pnpm admin:grant <email>
import postgres from "postgres";

const email = process.argv[2]?.trim().toLowerCase();
const url = process.env.DATABASE_URL;
if (!email) {
  console.error("Usage : pnpm admin:grant <email>");
  process.exit(1);
}
if (!url) {
  console.error("DATABASE_URL manquante");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const rows = await sql`
    update users set is_super_admin = true
    where lower(email) = ${email} and deleted_at is null
    returning username`;
  if (rows.length === 0) {
    console.error(`Aucun compte pour ${email}.`);
    process.exitCode = 1;
  } else {
    console.log(`${rows[0]!.username} est super-admin.`);
  }
} finally {
  await sql.end();
}
