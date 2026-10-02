"use client";

import dynamic from "next/dynamic";

/** Heures et jours dans le fuseau du téléphone : rendu côté client seulement. */
export const ChatClient = dynamic(() => import("./ChatView").then((m) => m.ChatView), {
  ssr: false,
});
