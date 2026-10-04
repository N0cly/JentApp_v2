"use server";

import { requireUser } from "@/server/auth";
import { markReleaseSeen } from "@/server/releases";

/** « Compris » : la version courante est notée lue, côté serveur. */
export async function markReleaseSeenAction(): Promise<void> {
  const user = await requireUser();
  await markReleaseSeen(user);
}
