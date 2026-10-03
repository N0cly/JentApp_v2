"use client";

import { Button } from "@/components/ui";

/** « Réessayer » : recharge la page demandée. */
export function RetryButton() {
  return <Button onClick={() => window.location.reload()}>Réessayer</Button>;
}
