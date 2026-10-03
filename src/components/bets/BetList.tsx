"use client";

import { frenchSpacing } from "@/lib/typo";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Amount,
  BetOption,
  Button,
  Card,
  Chip,
  ClockIcon,
  Countdown,
  formatRemaining,
  LockIcon,
  MomentBadge,
  useRemaining,
} from "@/components/ui";
import { RefreshAt } from "@/components/RefreshAt";
import type { BetView } from "@/server/bets/view";
import type { Moment } from "@/server/bets/rules";
import { TicketSheet, type TicketTarget } from "./TicketSheet";

const filters: { value: Moment | "ALL"; label: string }[] = [
  { value: "ALL", label: "Tous" },
  { value: "BEFORE", label: "Before" },
  { value: "NIGHT", label: "Night" },
  { value: "AFTER", label: "After" },
  { value: "DAILY", label: "Daily" },
  { value: "SPECIAL", label: "Spécial" },
];

type Ended = Extract<BetView, { state: "closed" | "resolved" | "settled" | "cancelled" }>;

function optionLabel(view: Ended, id: string | null | undefined) {
  return view.options.find((o) => o.id === id)?.label ?? "";
}

/** Ligne d'état des cartes fermées, saisies, réglées ou annulées (paris.html, 2e carte). */
function StatusRow({
  href,
  title,
  subtitle,
  right,
}: {
  href: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[56px] items-center justify-between gap-3 rounded-md bg-surface-raised px-4 py-1"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] font-semibold [overflow-wrap:anywhere]">{title}</span>
        {subtitle && <span className="text-caption truncate text-ink-subtle">{subtitle}</span>}
      </span>
      {right && (
        <span className="flex max-w-[50%] shrink-0 flex-col items-end text-right [overflow-wrap:anywhere]">
          {right}
        </span>
      )}
    </Link>
  );
}

function MyStake({ view }: { view: Ended }) {
  if (!view.myWager) return null;
  return (
    <>
      <Amount value={view.myWager.amount} />
      <span className="text-caption text-brand">
        ta mise, sur {optionLabel(view, view.myWager.optionId)}
      </span>
    </>
  );
}

function ScheduledCard({
  view,
  href,
}: {
  view: Extract<BetView, { state: "scheduled" }>;
  href: string;
}) {
  const remaining = useRemaining(view.opensAt);
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-3 rounded-lg border-[1.5px] border-dashed border-line-strong bg-bg px-4 py-3"
    >
      <span className="flex size-[44px] shrink-0 items-center justify-center rounded-full bg-surface text-brand">
        {view.mystery ? <LockIcon size={20} /> : <ClockIcon size={20} />}
      </span>
      <span className="flex min-w-0 grow flex-col">
        <span className="text-[16px] leading-5 font-bold [overflow-wrap:anywhere]">
          {view.mystery ? "Pari mystère" : view.question}
        </span>
        <span className="text-caption truncate text-ink-subtle">
          {view.mystery ? "Question révélée à l'ouverture" : `par ${view.creator}`}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="text-overline text-ink-subtle">S&apos;OUVRE DANS</span>
        <span className="font-mono text-[15px] leading-5 font-medium text-brand">
          {remaining === null ? "--:--" : formatRemaining(remaining, "opens")}
        </span>
      </span>
    </Link>
  );
}

function BetCard({
  view,
  base,
  onPick,
}: {
  view: BetView;
  base: string;
  onPick: (target: TicketTarget) => void;
}) {
  const href = `${base}/${view.id}`;
  if (view.state === "scheduled") return <ScheduledCard view={view} href={href} />;

  return (
    <Card className="shrink-0">
      <div className="flex items-center justify-between">
        <MomentBadge moment={view.moment} />
        {view.state === "open" && <Countdown kind="closes" until={view.closesAt} />}
        {view.state === "resolved" && view.settlesAt && (
          <>
            <Countdown kind="payout" until={view.settlesAt} />
            {/* À l'échéance, le rechargement déclenche le versement côté serveur. */}
            <RefreshAt until={view.settlesAt} />
          </>
        )}
      </div>
      <Link href={href}>
        <h2 className="text-heading">{frenchSpacing(view.question)}</h2>
      </Link>

      {view.state === "open" && (
        <>
          <div className="flex flex-col gap-2">
            {view.options.map((option) => {
              const mine = view.myWager?.optionId === option.id;
              const locked = view.myWager !== null && !mine;
              const pick = () =>
                onPick({
                  bet: {
                    id: view.id,
                    question: view.question,
                    moment: view.moment,
                    closesAt: view.closesAt,
                    pot: view.pot,
                  },
                  option,
                  alreadyStaked: mine ? view.myWager!.amount : null,
                });
              return (
                <BetOption
                  key={option.id}
                  label={option.label}
                  myStake={mine ? view.myWager!.amount : undefined}
                  onClick={locked ? undefined : pick}
                />
              );
            })}
          </div>
          <div className="text-caption flex flex-wrap items-center justify-between gap-x-3 text-ink-subtle">
            <span className="flex flex-wrap items-center gap-x-1">
              <span className="text-ink">Pot</span>
              <span className="text-ink">
                <Amount value={view.pot} size="sm" />
              </span>
              · {view.bettors} {view.bettors > 1 ? "parieurs" : "parieur"}
            </span>
            <span className="ml-auto min-w-0 truncate">par {view.creator}</span>
          </div>
        </>
      )}

      {view.state === "closed" && (
        <StatusRow
          href={href}
          title="Fermé · en attente du résultat"
          subtitle={`par ${view.creator}`}
          right={<MyStake view={view} />}
        />
      )}
      {view.state === "resolved" && (
        <StatusRow
          href={href}
          title={`Résultat saisi : ${optionLabel(view, view.winningOptionId)}`}
          subtitle={`par ${view.resolvedBy} · corrigeable`}
          right={<MyStake view={view} />}
        />
      )}
      {view.state === "settled" && (
        <StatusRow
          href={href}
          title="Réglé"
          subtitle={
            view.refund ? "mises rendues" : `Résultat : ${optionLabel(view, view.winningOptionId)}`
          }
          right={
            view.myWager &&
            (view.refund ? (
              <span className="text-caption text-ink-muted">rendu</span>
            ) : (
              <Amount value={(view.myWager.payout ?? 0) - view.myWager.amount} delta />
            ))
          }
        />
      )}
      {view.state === "cancelled" && <StatusRow href={href} title="Annulé · mises rendues" />}
    </Card>
  );
}

/** Onglet Paris : filtre par moment, cartes, ticket de mise. */
export function BetList({
  leagueId,
  bets,
  balance,
}: {
  leagueId: string;
  bets: BetView[];
  balance: number;
}) {
  const [filter, setFilter] = useState<Moment | "ALL">("ALL");
  const [ticket, setTicket] = useState<TicketTarget | null>(null);
  const base = `/l/${leagueId}/paris`;
  const shown = bets.filter((b) => filter === "ALL" || b.moment === filter);

  return (
    <>
      <div className="flex shrink-0 gap-2 overflow-x-auto px-5 pb-4">
        {filters.map((f) => (
          <Chip key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </Chip>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="flex grow flex-col items-center justify-center gap-4 px-5 pb-8">
          <p className="text-body text-center text-ink-muted">Rien d&apos;ouvert. Lance un pari.</p>
          <Button href={`${base}/nouveau`} className="w-auto px-6">
            Nouveau pari
          </Button>
        </div>
      ) : (
        <main className="flex flex-col gap-3 px-5 pb-5">
          {shown.map((view) => (
            <BetCard key={view.id} view={view} base={base} onPick={setTicket} />
          ))}
        </main>
      )}
      {ticket && (
        <TicketSheet
          leagueId={leagueId}
          target={ticket}
          balance={balance}
          onClose={() => setTicket(null)}
        />
      )}
    </>
  );
}
