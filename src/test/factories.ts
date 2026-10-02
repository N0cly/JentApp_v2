import { getDb } from "@/db/client";
import { users } from "@/db/schema";

let n = 0;

/** Compte de test inséré directement (sans passer par l'inscription). */
export async function createUser(name?: string) {
  n += 1;
  const username = name ?? `Joueur${n}`;
  const [user] = await getDb()
    .insert(users)
    .values({ name: username, email: `${username.toLowerCase()}-${n}@exemple.fr` })
    .returning();
  return user!;
}
