// Nettoyage de la validation après restauration d'une sauvegarde de production
// (docs/VALIDATION.md, A.6). Refuse de tourner si APP_ENV n'est pas `validation`.
// Usage, dans le conteneur : node scripts/validation-scrub.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  assertValidation,
  keepEmails,
  NotValidationError,
  scrub,
} from "../src/server/validation/scrub.ts";

try {
  assertValidation();
} catch (error) {
  if (!(error instanceof NotValidationError)) throw error;
  console.error(error.message);
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquante");
  process.exit(1);
}

const keep = keepEmails();
const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  const report = await scrub(drizzle(client), keep);
  console.log(
    `Nettoyage : ${report.scrubbed} compte(s) anonymisé(s), ${report.kept.length} gardé(s).`,
  );
  for (const email of report.missing) console.warn(`Compte gardé introuvable : ${email}`);
  if (keep.length === 0) console.warn("VALIDATION_KEEP_EMAILS est vide : aucun compte gardé.");
  console.log("Sessions, vérifications, abonnements push et compteurs de tentatives supprimés.");
} finally {
  await client.end();
}
