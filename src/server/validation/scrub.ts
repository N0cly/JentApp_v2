// Nettoyage de la copie de production (docs/VALIDATION.md, A.6). Les comptes
// gardés restent intacts ; les autres perdent leur email réel et leur mot de
// passe, mais gardent pseudo, soldes, paris et messages, pour que les écrans
// ressemblent à la production.
// Sans alias d'import : scripts/validation-scrub.ts charge ce fichier avec Node.

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { isValidation } from "../env.ts";

type Db = PostgresJsDatabase<Record<string, unknown>>;

export class NotValidationError extends Error {
  constructor() {
    super("Refusé : APP_ENV n'est pas « validation ». Ce script ne tourne que sur la validation.");
  }
}

/** Refuse de continuer hors de la validation. */
export function assertValidation(env: Record<string, string | undefined> = process.env) {
  if (!isValidation(env)) throw new NotValidationError();
}

/** `VALIDATION_KEEP_EMAILS` : emails séparés par des virgules, sans tenir compte de la casse. */
export function keepEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.VALIDATION_KEEP_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export type ScrubReport = { kept: string[]; missing: string[]; scrubbed: number };

/** Nettoie, en une transaction. Refuse hors validation. */
export async function scrub(
  db: Db,
  keep: string[],
  env: Record<string, string | undefined> = process.env,
): Promise<ScrubReport> {
  assertValidation(env);
  const kept = keep.map((e) => e.toLowerCase());
  // Les emails n'ont pas de virgule : une seule chaîne, découpée par Postgres.
  const keptList = sql`string_to_array(${kept.join(",")}, ',')`;
  return db.transaction(async (tx) => {
    const found = await tx.execute<{ email: string }>(sql`
      select lower(email) as email from users where lower(email) = any(${keptList})
    `);
    const keptFound = found.map((r) => r.email);
    const others = sql`not (lower(email) = any(${keptList}))`;

    // Mots de passe des autres : supprimés, plus aucune connexion possible.
    await tx.execute(sql`
      update accounts set password = null, access_token = null, refresh_token = null, id_token = null
      where user_id in (select id from users where ${others})
    `);
    // Emails des autres : d'abord un nom provisoire unique, puis numérotés dans
    // l'ordre d'inscription (un nettoyage relancé ne heurte pas l'index unique).
    await tx.execute(sql`
      update users set email = id::text || '@scrub.invalid' where ${others}
    `);
    const renamed = await tx.execute<{ id: string }>(sql`
      update users u set email = 'joueur-' || n.rank || '@validation.invalid'
      from (
        select id, row_number() over (order by created_at, id) as rank
        from users where email like '%@scrub.invalid'
      ) n
      where u.id = n.id
      returning u.id
    `);
    // Pour tout le monde : sessions, vérifications, abonnements push, compteurs.
    await tx.execute(sql`delete from sessions`);
    await tx.execute(sql`delete from verifications`);
    await tx.execute(sql`delete from push_subscriptions`);
    await tx.execute(sql`delete from rate_limits`);
    return {
      kept: keptFound,
      missing: kept.filter((e) => !keptFound.includes(e)),
      scrubbed: renamed.length,
    };
  });
}
