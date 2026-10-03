"use client";

import { countOf } from "@/lib/units";
import { frenchSpacing } from "@/lib/typo";
import { useState, useTransition } from "react";
import { placeWagerAction } from "@/app/(app)/l/[ligue]/paris/actions";
import { LocalTime } from "@/components/LocalTime";
import {
  BottomSheet,
  Button,
  FieldError,
  IconButton,
  JointIcon,
  MinusIcon,
  PaquetIcon,
  PlusIcon,
  Ticket,
  TicketCut,
  TicketOverline,
  TicketRow,
  TicketSection,
  TicketTitle,
} from "@/components/ui";
import type { Moment } from "@/server/bets/rules";

const momentLabel: Record<Moment, string> = {
  BEFORE: "BEFORE",
  NIGHT: "NIGHT",
  AFTER: "AFTER",
  DAILY: "DAILY",
  SPECIAL: "SPÉCIAL",
};

export type TicketTarget = {
  bet: { id: string; question: string; moment: Moment; closesAt: Date; pot: number };
  option: { id: string; label: string };
  /** Déjà misé sur cette option : on ajoute à la mise. */
  alreadyStaked: number | null;
};

const clopes = (n: number) => `${n} ${n > 1 ? "clopes" : "clope"}`;

function Shortcut({
  label,
  hint,
  icon,
  onClick,
}: {
  label: string;
  hint: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[52px] flex-col items-center justify-center rounded-md border border-line-strong bg-surface px-2 py-1"
    >
      <span className="flex items-center gap-1 font-mono text-[15px] font-medium">
        {label}
        {icon && <span className="flex text-brand">{icon}</span>}
      </span>
      <span className="text-caption text-ink-muted">{hint}</span>
    </button>
  );
}

/** Ticket de mise (ticket-de-mise.html). Un identifiant par ouverture : un double envoi ne mise qu'une fois. */
export function TicketSheet({
  leagueId,
  target,
  balance,
  onClose,
}: {
  leagueId: string;
  target: TicketTarget;
  balance: number;
  onClose: () => void;
}) {
  const [ticketId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(balance > 0 ? 1 : 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (next: number) => {
    setAmount(Math.max(balance > 0 ? 1 : 0, Math.min(balance, next)));
    setError(null);
  };
  const { bet, option, alreadyStaked } = target;
  const missing = balance < 1 ? 1 : 0;

  function validate() {
    start(async () => {
      const result = await placeWagerAction(leagueId, bet.id, {
        optionId: option.id,
        amount,
        ticketId,
      });
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <BottomSheet open onClose={onClose} title="Ton ticket">
      <Ticket behind="surface-raised">
        <TicketSection>
          <TicketOverline end={<LocalTime date={bet.closesAt} prefix="ferme " upper />}>
            {momentLabel[bet.moment]}
          </TicketOverline>
          <TicketTitle>{frenchSpacing(bet.question)}</TicketTitle>
          <TicketRow label="Choix">{option.label}</TicketRow>
          <TicketRow label="Pot actuel">{clopes(bet.pot)}</TicketRow>
        </TicketSection>
        <TicketCut />
        <TicketSection>
          {alreadyStaked !== null && (
            <TicketRow label="Déjà misé">{clopes(alreadyStaked)}</TicketRow>
          )}
          <TicketRow label="Mise">{clopes(amount)}</TicketRow>
          <TicketRow label="Gain">connu à la fermeture</TicketRow>
        </TicketSection>
      </Ticket>
      <p className="text-caption text-ink-muted">
        Les gagnants se partagent le pot au prorata de leur mise.
      </p>
      <div className="flex items-center justify-between gap-4">
        <IconButton
          label="Retirer une clope"
          variant="outlined"
          size="lg"
          disabled={amount <= 1}
          onClick={() => set(amount - 1)}
        >
          <MinusIcon size={22} />
        </IconButton>
        <div className="flex flex-col items-center">
          <span className="font-mono text-[44px] leading-[48px] font-medium">{amount}</span>
          <span className="text-caption text-ink-muted">
            {amount > 1 ? "clopes misées" : "clope misée"}
          </span>
        </div>
        <IconButton
          label="Ajouter une clope"
          variant="outlined"
          size="lg"
          disabled={amount >= balance}
          onClick={() => set(amount + 1)}
        >
          <PlusIcon size={22} />
        </IconButton>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Shortcut
          label="+5"
          hint="un joint"
          icon={<JointIcon size={16} />}
          onClick={() => set(amount + 5)}
        />
        <Shortcut
          label="+20"
          hint="un paquet"
          icon={<PaquetIcon size={16} />}
          onClick={() => set(amount + 20)}
        />
        <Shortcut label="Tapis" hint="tout le solde" onClick={() => set(balance)} />
      </div>
      <div className="flex justify-between font-mono text-[13px] leading-[18px] font-medium text-ink-muted">
        <span>Solde après mise</span>
        <span>{clopes(balance - amount)}</span>
      </div>
      {(error ?? (missing ? `Il te manque ${countOf(missing)}.` : null)) && (
        <FieldError id="ticket-error">{error ?? `Il te manque ${countOf(missing)}.`}</FieldError>
      )}
      <Button onClick={validate} disabled={pending || amount < 1}>
        Valider le ticket
      </Button>
    </BottomSheet>
  );
}
