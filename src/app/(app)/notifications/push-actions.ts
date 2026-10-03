"use server";

import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { isSubscribed, subscribe, unsubscribe, type BrowserSubscription } from "@/server/push";

/** Enregistre l'abonnement push de cet appareil. */
export async function subscribePushAction(subscription: BrowserSubscription): Promise<void> {
  const user = await requireUser();
  try {
    await subscribe(user, subscription);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

/** Coupe le push de cet appareil. */
export async function unsubscribePushAction(endpoint: string): Promise<void> {
  const user = await requireUser();
  await unsubscribe(user, endpoint);
}

/** Cet appareil reçoit-il le push de ce joueur ? */
export async function pushStatusAction(endpoint: string): Promise<boolean> {
  const user = await requireUser();
  return isSubscribed(user, endpoint);
}
