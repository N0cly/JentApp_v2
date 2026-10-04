// Incarner un joueur sur la validation (docs/VALIDATION.md, A.7) : donne un mot
// de passe à un compte nettoyé, pour reproduire ce qu'un joueur signale.
// Sans alias d'import : scripts/validation-login.ts charge ce fichier avec Node.

import { randomBytes, scrypt } from "node:crypto";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { assertValidation } from "./scrub.ts";

type Db = PostgresJsDatabase<Record<string, unknown>>;

export const SCRUBBED_DOMAIN = "@validation.invalid";
const PASSWORD_MIN = 8;

export class LoginError extends Error {}

// Même hachage que Better Auth (@better-auth/utils/password) : scrypt N=16384,
// r=16, p=1, 64 octets, sel de 16 octets en hexadécimal, « sel:clé ».
const SCRYPT = { N: 16384, r: 16, p: 1, dkLen: 64 };

export function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      SCRYPT.dkLen,
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 128 * SCRYPT.N * SCRYPT.r * 2 },
      (error, key) => (error ? reject(error) : resolve(`${salt}:${key.toString("hex")}`)),
    );
  });
}

/** Donne `password` au compte nettoyé de ce pseudo ; renvoie l'email avec lequel se connecter. */
export async function impersonate(
  db: Db,
  username: string,
  password: string,
  env: Record<string, string | undefined> = process.env,
): Promise<{ username: string; email: string }> {
  assertValidation(env);
  if (password.length < PASSWORD_MIN) {
    throw new LoginError(`Mot de passe trop court, ${PASSWORD_MIN} caractères au moins.`);
  }
  const [user] = await db.execute<{ id: string; username: string; email: string }>(sql`
    select id, username, email from users
    where lower(username) = lower(${username.trim()}) and deleted_at is null
  `);
  if (!user) throw new LoginError(`Aucun joueur « ${username.trim()} ».`);
  if (!user.email.endsWith(SCRUBBED_DOMAIN)) {
    throw new LoginError(
      `${user.username} n'est pas un compte nettoyé : son mot de passe ne change pas.`,
    );
  }
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const updated = await tx.execute<{ id: string }>(sql`
      update accounts set password = ${hash}, updated_at = now()
      where user_id = ${user.id} and provider_id = 'credential'
      returning id
    `);
    if (updated.length === 0) {
      await tx.execute(sql`
        insert into accounts (account_id, provider_id, user_id, password)
        values (${user.id}, 'credential', ${user.id}, ${hash})
      `);
    }
  });
  return { username: user.username, email: user.email };
}
