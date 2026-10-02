"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useRemaining } from "@/components/ui";

/** Recharge la page quand l'échéance passe : l'état du pari change côté serveur. */
export function RefreshAt({ until }: { until: Date }) {
  const router = useRouter();
  const remaining = useRemaining(until);
  const done = useRef(false);
  useEffect(() => {
    if (remaining !== null && remaining <= 0 && !done.current) {
      done.current = true;
      // Une seconde de marge : l'heure du serveur fait foi.
      setTimeout(() => router.refresh(), 1000);
    }
  }, [remaining, router]);
  return null;
}
