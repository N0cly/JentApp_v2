import { headers } from "next/headers";
import type { ReactNode } from "react";
import { WhatsNewSheet } from "@/components/releases/WhatsNewSheet";
import { getSessionUser } from "@/server/auth";
import { pendingRelease } from "@/server/releases";

/** Pages d'un joueur connecté : la feuille « Quoi de neuf » après une mise à jour. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser(await headers());
  const release = user ? await pendingRelease(user) : null;
  return (
    <>
      {children}
      {release && <WhatsNewSheet release={release} />}
    </>
  );
}
