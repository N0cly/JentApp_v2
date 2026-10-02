"use client";

import { formatRemaining, useRemaining } from "@/components/ui";

/** Bloc « Versement dans » de resultat-en-attente.html. */
export function PayoutCountdown({ until }: { until: Date }) {
  const remaining = useRemaining(until);
  return (
    <div role="timer" className="flex shrink-0 flex-col items-center rounded-lg bg-surface p-4">
      <span className="text-overline text-ink-subtle">VERSEMENT DANS</span>
      <span className="font-mono text-[44px] leading-[48px] font-medium text-brand">
        {remaining === null ? "--:--" : formatRemaining(remaining, "payout")}
      </span>
    </div>
  );
}
