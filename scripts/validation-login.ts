// Incarner un joueur sur la validation (docs/VALIDATION.md, A.7). Refuse de
// tourner si APP_ENV n'est pas `validation`.
// Usage, dans le conteneur : node scripts/validation-login.ts <pseudo> <mot de passe>
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { impersonate, LoginError } from "../src/server/validation/login.ts";
import { assertValidation, NotValidationError } from "../src/server/validation/scrub.ts";

try {
  assertValidation();
} catch (error) {
  if (!(error instanceof NotValidationError)) throw error;
  console.error(error.message);
  process.exit(1);
}
const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error("Usage : validation-login.ts <pseudo> <mot de passe>");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquante");
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  const who = await impersonate(drizzle(client), username, password);
  console.log(
    `${who.username} : connecte-toi sur la validation avec ${who.email} et ce mot de passe.`,
  );
} catch (error) {
  if (!(error instanceof LoginError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
