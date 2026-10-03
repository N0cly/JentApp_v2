import type { ReactNode } from "react";
import { frenchSpacing } from "@/lib/typo";
import { LocalTime } from "@/components/LocalTime";
import { RefreshAt } from "@/components/RefreshAt";
import {
  Amount,
  BetOption,
  CheckIcon,
  Countdown,
  LockIcon,
  MomentBadge,
  Stamp,
  Ticket,
  TicketCut,
  TicketOverline,
  TicketRow,
  TicketSection,
} from "@/components/ui";
import { formatOdds } from "@/server/bets/settle";
import type { BetView, RefundReason } from "@/server/bets/view";
import { BetActions } from "./BetActions";
import { OpenBetOptions } from "./OpenBetOptions";
import { PayoutCountdown } from "./PayoutCountdown";
import { ResultForm } from "./ResultForm";

type Ended = Extract<BetView, { state: "closed" | "resolved" | "settled" | "cancelled" }>;

const clopes = (n: number) => `${n} ${n > 1 ? "clopes" : "clope"}`;
const MINUS = "−";

export const refundLabels: Record<RefundReason, string> = {
  alone: "personne en face",
  cancelled: "pari annulé",
  tie: "égalité",
  expired: "sans résultat depuis 7 jours",
};

function Title({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-[28px] leading-8 font-extrabold tracking-[-0.02em] [font-stretch:85%]">
      {children}
    </h1>
  );
}

function Overline({ children }: { children: ReactNode }) {
  return <span className="text-overline text-ink-subtle">{children}</span>;
}

function label(view: Ended, id: string | null | undefined) {
  return view.options.find((o) => o.id === id)?.label ?? "";
}

/** Pari programmé (sans maquette) : la mise en page du pari ouvert, sans pot ni mise. */
export function ScheduledBet({
  leagueId,
  view,
}: {
  leagueId: string;
  view: Extract<BetView, { state: "scheduled" }>;
}) {
  return (
    <>
      <RefreshAt until={view.opensAt} />
      <div className="flex items-center justify-between">
        <MomentBadge moment={view.moment} />
        <Countdown kind="opens" until={view.opensAt} />
      </div>
      <Title>{view.mystery ? "Pari mystère" : frenchSpacing(view.question)}</Title>
      <p className="text-caption text-ink-muted">
        {view.mystery ? "Question révélée à l'ouverture. " : ""}Créé par {view.creator}
      </p>
      {!view.mystery && (
        <div className="flex flex-col gap-2">
          {view.options.map((o) => (
            <BetOption key={o.id} label={o.label} />
          ))}
        </div>
      )}
      <div className="grow" />
      <BetActions leagueId={leagueId} betId={view.id} {...view.permissions} />
    </>
  );
}

function Tile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-md bg-surface px-4 py-3">
      <span className="text-overline text-ink-subtle">{title}</span>
      <span className="font-mono text-[28px] leading-8 font-medium">{children}</span>
    </div>
  );
}

/** pari-ouvert.html */
export function OpenBet({
  leagueId,
  view,
  balance,
}: {
  leagueId: string;
  view: Extract<BetView, { state: "open" }>;
  balance: number;
}) {
  return (
    <>
      <RefreshAt until={view.closesAt} />
      <div className="flex items-center justify-between">
        <MomentBadge moment={view.moment} />
        <Countdown kind="closes" until={view.closesAt} />
      </div>
      <Title>{frenchSpacing(view.question)}</Title>
      <p className="text-caption text-ink-muted">Créé par {view.creator}</p>
      <div className="grid shrink-0 grid-cols-2 gap-2">
        <Tile title="POT">
          <Amount value={view.pot} size="lg" />
        </Tile>
        <Tile title="PARIEURS">{view.bettors}</Tile>
      </div>
      <OpenBetOptions leagueId={leagueId} view={view} balance={balance} />
      <div className="text-caption flex items-center gap-1 text-ink-subtle">
        <LockIcon size={14} />
        Répartition et cote révélées à la fermeture
      </div>
      <div className="grow" />
      <BetActions leagueId={leagueId} betId={view.id} {...view.permissions} />
    </>
  );
}

/** saisir-le-resultat.html ; sans sélection ni boutons pour qui ne peut pas saisir. */
export function ClosedBet({
  leagueId,
  view,
  correcting,
  delayMinutes,
}: {
  leagueId: string;
  view: Ended;
  correcting: boolean;
  delayMinutes: number;
}) {
  const canChoose = correcting ? view.permissions.canCorrect : view.permissions.canResolve;
  return (
    <>
      <div className="flex items-center gap-2">
        <MomentBadge moment={view.moment} />
        <Overline>
          FERMÉ · {view.bettors} {view.bettors > 1 ? "PARIEURS" : "PARIEUR"} · POT {view.pot}
        </Overline>
      </div>
      <Title>{frenchSpacing(view.question)}</Title>
      {canChoose ? (
        <ResultForm
          leagueId={leagueId}
          betId={view.id}
          options={view.options}
          mode={correcting ? "correct" : "resolve"}
          initial={correcting ? view.winningOptionId : null}
          delayMinutes={delayMinutes}
        />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {view.options.map((o) => (
              <BetOption
                key={o.id}
                label={o.label}
                meta={`${clopes(o.amount)} · ${o.count} ${o.count > 1 ? "mises" : "mise"}`}
                myStake={view.myWager?.optionId === o.id ? view.myWager.amount : undefined}
              />
            ))}
          </div>
          <p className="text-body text-ink-muted">En attente du résultat.</p>
          <div className="grow" />
          <BetActions
            leagueId={leagueId}
            betId={view.id}
            canEdit={false}
            canCancel={view.permissions.canCancel}
          />
        </>
      )}
    </>
  );
}

/** Ticket du joueur, sur le pari saisi, réglé ou annulé. */
function MyTicket({ view, stamped }: { view: Ended; stamped: boolean }) {
  if (!view.myWager) return null;
  const stake = view.myWager.amount;
  const gain = view.myGain ?? 0;
  const won = !view.refund && gain > 0;
  const stamp = stamped && !view.refund ? <Stamp outcome={won ? "won" : "lost"} /> : undefined;
  return (
    <Ticket behind="bg" stamp={stamp} className="shrink-0">
      <TicketSection>
        <TicketOverline>TON TICKET</TicketOverline>
        {view.winningOptionId && !view.refund && (
          <TicketRow label="Résultat">{label(view, view.winningOptionId)}</TicketRow>
        )}
        <TicketRow label="Ta mise">{clopes(stake)}</TicketRow>
        {view.oddsCents !== null && (
          <TicketRow label={view.state === "settled" ? "Cote finale" : "Cote"}>
            {formatOdds(view.oddsCents)}
          </TicketRow>
        )}
      </TicketSection>
      <TicketCut />
      <TicketSection>
        {view.refund ? (
          <TicketRow label="Rendu">
            {clopes(stake)} · {refundLabels[view.refund]}
          </TicketRow>
        ) : won ? (
          <TicketRow label={view.state === "settled" ? "Gain" : "Gain à verser"} outcome="win">
            +{gain} clopes
          </TicketRow>
        ) : (
          <TicketRow label="Perte" outcome="loss">
            {MINUS}
            {stake} {stake > 1 ? "clopes" : "clope"}
          </TicketRow>
        )}
      </TicketSection>
    </Ticket>
  );
}

/** resultat-en-attente.html */
export function ResolvedBet({
  leagueId,
  view,
  delayMinutes,
}: {
  leagueId: string;
  view: Ended;
  delayMinutes: number;
}) {
  return (
    <>
      {view.settlesAt && <RefreshAt until={view.settlesAt} />}
      <div className="flex items-center gap-2">
        <MomentBadge moment={view.moment} />
        <Overline>
          SAISI PAR {view.resolvedBy?.toUpperCase()}{" "}
          {view.resolvedAt && <LocalTime date={view.resolvedAt} upper />}
        </Overline>
      </div>
      <Title>{frenchSpacing(view.question)}</Title>
      {view.settlesAt && <PayoutCountdown until={view.settlesAt} />}
      <MyTicket view={view} stamped={false} />
      <div className="grow" />
      {view.permissions.canCorrect && (
        <>
          <a
            href={`/l/${leagueId}/paris/${view.id}?corriger=1`}
            className="flex min-h-[52px] shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface text-[15px] font-bold"
          >
            Corriger le résultat
          </a>
          <p className="text-caption text-ink-subtle">
            Corriger relance {delayMinutes > 1 ? `les ${delayMinutes} minutes` : "la minute"}.
            Boutons visibles par celui qui a saisi, les admins et l&apos;owner.
          </p>
        </>
      )}
      <BetActions
        leagueId={leagueId}
        betId={view.id}
        canEdit={false}
        canCancel={view.permissions.canCancel}
      />
    </>
  );
}

/** pari-regle.html, et pari annulé (mises rendues). */
export function SettledBet({ view }: { view: Ended }) {
  const total = view.options.reduce((s, o) => s + o.amount, 0);
  const winners = view.wagers
    .filter((w) => !view.refund && w.optionId === view.winningOptionId && (w.payout ?? 0) > 0)
    .sort((a, b) => (b.payout ?? 0) - (a.payout ?? 0));
  return (
    <>
      <div className="flex items-center gap-2">
        <MomentBadge moment={view.moment} />
        <Overline>
          {view.bettors} {view.bettors > 1 ? "PARIEURS" : "PARIEUR"} · POT {view.pot}
          {view.seed > 0 && `, DONT CAGNOTTE ${view.seed}`}
        </Overline>
      </div>
      <Title>{frenchSpacing(view.question)}</Title>
      <MyTicket view={view} stamped={view.state === "settled"} />
      <section className="flex flex-col gap-3">
        <h2 className="text-overline text-ink-subtle">RÉPARTITION DES MISES</h2>
        {view.options.map((o) => {
          const winner = !view.refund && o.id === view.winningOptionId;
          const percent = total > 0 ? Math.round((o.amount * 100) / total) : 0;
          return (
            <div key={o.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[15px] leading-5 font-semibold">
                  {o.label}
                  {winner && (
                    <span className="flex text-win">
                      <CheckIcon size={16} />
                    </span>
                  )}
                </span>
                <span className="font-mono text-[13px] font-medium text-ink-muted">
                  {clopes(o.amount)} · {percent} %
                </span>
              </div>
              <div className="h-[8px] overflow-hidden rounded-full bg-surface-raised">
                <div
                  className={
                    winner ? "h-[8px] rounded-full bg-win" : "h-[8px] rounded-full bg-line-strong"
                  }
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-caption text-ink-subtle">
                {o.count} {o.count > 1 ? "mises" : "mise"}
              </span>
            </div>
          );
        })}
      </section>
      {winners.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="mb-1 text-overline text-ink-subtle">GAINS VERSÉS</h2>
          {winners.map((w, i) => (
            <div key={w.player + i} className="flex min-h-[44px] items-center gap-3">
              <span className="w-[16px] shrink-0 font-mono text-[13px] font-medium text-ink-subtle">
                {i + 1}
              </span>
              <span className="flex min-w-0 grow flex-col">
                <span className="truncate text-[15px] leading-5 font-semibold">{w.player}</span>
                <span className="text-caption text-ink-subtle">sur {label(view, w.optionId)}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="font-mono text-[15px] leading-5 font-medium">{w.amount}</span>
                <span className="font-mono text-[12px] leading-4 font-medium text-win">
                  +{w.payout}
                </span>
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
