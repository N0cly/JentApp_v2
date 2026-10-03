"use server";

import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { equip, purchase, type CosmeticType } from "@/server/shop";

async function orNotFound<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

/** Acheter un cosmétique dans la ligue ; il est porté aussitôt. */
export async function purchaseAction(
  leagueId: string,
  cosmeticId: string,
): Promise<{ error?: string }> {
  const user = await requireUser();
  const result = await orNotFound(() => purchase(user, leagueId, String(cosmeticId), new Date()));
  return result.ok ? {} : { error: result.error };
}

/** Porter un cosmétique possédé, ou retirer (null). */
export async function equipAction(
  leagueId: string,
  type: CosmeticType,
  cosmeticId: string | null,
): Promise<void> {
  const user = await requireUser();
  await orNotFound(() =>
    equip(user, leagueId, type, cosmeticId === null ? null : String(cosmeticId)),
  );
}
