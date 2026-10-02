"use client";

import { useSyncExternalStore } from "react";
import { atTime } from "@/lib/time-format";

const subscribe = () => () => {};

/**
 * Heure dans le fuseau du téléphone. Rien au rendu serveur : le fuseau
 * n'existe que dans le navigateur.
 */
export function LocalTime({
  date,
  prefix = "",
  upper = false,
}: {
  date: Date;
  prefix?: string;
  upper?: boolean;
}) {
  const text = useSyncExternalStore(
    subscribe,
    () => `${prefix}${atTime(date, new Date())}`,
    () => null,
  );
  if (text === null) return null;
  return <>{upper ? text.toUpperCase() : text}</>;
}
