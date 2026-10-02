"use client";

import Link from "next/link";
import { TicketCut, Ticket, useRemaining } from "@/components/ui";
import { frenchSpacing } from "@/lib/typo";
import type { BetView } from "@/server/bets/view";

const momentLabel = {
  BEFORE: "BEFORE",
  NIGHT: "NIGHT",
  AFTER: "AFTER",
  DAILY: "DAILY",
  SPECIAL: "SPÉCIAL",
} as const;

function hhmm(seconds: number | null) {
  if (seconds === null) return "--:--";
  const s = Math.max(0, seconds);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}`;
}

const stateLabel = {
  closed: "FERMÉ",
  resolved: "RÉSULTAT SAISI",
  settled: "RÉGLÉ",
  cancelled: "ANNULÉ",
} as const;

/** Carte d'un pari dans le chat (chat.html) : ce que le lecteur a le droit d'en voir. */
export function ChatBetCard({ leagueId, bet }: { leagueId: string; bet: BetView }) {
  const until = bet.state === "scheduled" ? bet.opensAt : bet.closesAt;
  const remaining = useRemaining(until);
  const mystery = bet.state === "scheduled" && bet.mystery;
  const status =
    bet.state === "scheduled"
      ? `S'OUVRE DANS ${hhmm(remaining)}`
      : bet.state === "open"
        ? `FERME DANS ${hhmm(remaining)}`
        : stateLabel[bet.state];
  const options = "options" in bet ? bet.options.length : 0;
  const pot = "pot" in bet ? bet.pot : null;
  const href = `/l/${leagueId}/paris/${bet.id}`;

  return (
    <Ticket behind="bg" className="w-[260px] shrink-0">
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="text-overline flex justify-between text-on-paper-muted">
          <span>{momentLabel[bet.moment]}</span>
          <span>{status}</span>
        </div>
        <div className="text-[16px] leading-5 font-bold">
          {mystery ? "Pari mystère" : "question" in bet ? frenchSpacing(bet.question) : ""}
        </div>
      </div>
      {!mystery && (
        <>
          <TicketCut />
          <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-3">
            <span className="font-mono text-[12px] leading-4 font-medium text-on-paper-muted">
              {options} options{pot !== null && ` · pot ${pot}`}
            </span>
            <Link
              href={href}
              className="flex min-h-[44px] items-center rounded-md bg-on-paper px-4 text-[14px] font-bold text-paper"
            >
              {bet.state === "open" ? "Parier" : "Voir"}
            </Link>
          </div>
        </>
      )}
    </Ticket>
  );
}
