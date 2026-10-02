"use client";

import dynamic from "next/dynamic";

/** Le formulaire dépend du fuseau du téléphone : rendu côté client seulement. */
export const BetFormClient = dynamic(() => import("./BetForm").then((m) => m.BetForm), {
  ssr: false,
});
