"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useLiveEvents } from "./LiveProvider";

/**
 * Paris, pages de pari et soldes se relisent par le rendu serveur (et ses
 * règles de visibilité) quand un signal les concerne. Les signaux proches
 * sont regroupés.
 */
export function LiveRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const opened = useRef(false);

  useLiveEvents(["bet.changed", "balance.changed", "member.changed"], (event) => {
    // La première ouverture du flux suit le chargement de la page : rien à relire.
    if (event.type === "resync" && !opened.current) {
      opened.current = true;
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 300);
  });
  return null;
}
