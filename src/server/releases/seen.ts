// Feuille « Quoi de neuf » (docs/VALIDATION.md, B.5) : affichée une fois par
// version et par compte, quel que soit l'appareil, puisque l'état est en base.

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { APP_VERSION, compareVersions, isVersion } from "@/lib/version";
import { readRelease, type Release } from "./notes";

/**
 * Les nouveautés à montrer, ou rien. Plusieurs versions manquées : seule la
 * dernière. Un compte sans version notée n'a rien à voir.
 */
export async function pendingRelease(user: { id: string }): Promise<Release | null> {
  const [row] = await getDb()
    .select({ seen: users.lastSeenRelease })
    .from(users)
    .where(eq(users.id, user.id));
  const seen = row?.seen;
  if (!seen || !isVersion(seen) || compareVersions(seen, APP_VERSION) >= 0) return null;
  return readRelease(APP_VERSION);
}

/** « Compris » : la version courante est lue, sur tous les appareils du compte. */
export async function markReleaseSeen(user: { id: string }): Promise<void> {
  await getDb().update(users).set({ lastSeenRelease: APP_VERSION }).where(eq(users.id, user.id));
}
