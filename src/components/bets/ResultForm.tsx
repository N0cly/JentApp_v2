"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resultAction } from "@/app/(app)/l/[ligue]/paris/actions";
import { BetOption, Button, ClockIcon, FieldError } from "@/components/ui";
import type { OptionTotals } from "@/server/bets/view";

const clopes = (n: number) => `${n} ${n > 1 ? "clopes" : "clope"}`;
const mises = (n: number) => `${n} ${n > 1 ? "mises" : "mise"}`;

/** Saisir ou corriger le résultat (saisir-le-resultat.html). */
export function ResultForm({
  leagueId,
  betId,
  options,
  mode,
  initial,
  delayMinutes,
}: {
  leagueId: string;
  betId: string;
  options: OptionTotals[];
  mode: "resolve" | "correct";
  initial: string | null;
  delayMinutes: number;
}) {
  const [selected, setSelected] = useState<string | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const chosen = options.find((o) => o.id === selected);

  const submit = (choice: { optionId: string } | { cancel: true }) =>
    start(async () => {
      const result = await resultAction(leagueId, betId, mode, choice);
      if (result.error) setError(result.error);
      // Corrigé : retour à la page du pari, sans le mode correction.
      else if (mode === "correct") router.replace(`/l/${leagueId}/paris/${betId}`);
    });

  return (
    <>
      <h2 className="text-overline text-ink-subtle">QUELLE OPTION A GAGNÉ ?</h2>
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <BetOption
            key={o.id}
            label={o.label}
            meta={`${clopes(o.amount)} · ${mises(o.count)}`}
            choice={{ selected: selected === o.id }}
            onClick={() => {
              setSelected(o.id);
              setError(null);
            }}
          />
        ))}
      </div>
      <div className="flex items-start gap-2 rounded-md bg-surface px-4 py-3">
        <span className="flex text-brand">
          <ClockIcon size={16} />
        </span>
        <span className="text-[13px] leading-[18px] text-ink-muted">
          Les gains sont versés {delayMinutes} {delayMinutes > 1 ? "minutes" : "minute"} après la
          saisie. D&apos;ici là, toi, un admin ou l&apos;owner pouvez corriger.
        </span>
      </div>
      {error && <FieldError id="result-error">{error}</FieldError>}
      <div className="grow" />
      <Button
        disabled={!chosen || pending}
        onClick={() => chosen && submit({ optionId: chosen.id })}
      >
        {chosen ? `Valider : ${chosen.label}` : "Choisis l'option gagnante"}
      </Button>
      <Button
        variant="discreet"
        destructive
        disabled={pending}
        onClick={() => submit({ cancel: true })}
      >
        Égalité ou erreur : annuler et rendre les mises
      </Button>
    </>
  );
}
