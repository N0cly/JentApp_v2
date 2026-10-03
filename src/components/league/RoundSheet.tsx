"use client";

import { countOf } from "@/lib/units";
import { useState, useTransition } from "react";
import { offerRoundAction } from "@/app/(app)/league-actions";
import {
  BottomSheet,
  Button,
  FieldError,
  GiftIcon,
  IconButton,
  MinusIcon,
  PlusIcon,
} from "@/components/ui";

const MIN = 1;
const MAX = 100;

/** Tournée générale : le même montant pour chaque membre actif. */
export function RoundButton({ leagueId, members }: { leagueId: string; members: number }) {
  const [open, setOpen] = useState(false);
  // Un identifiant par ouverture de la feuille : un double envoi ne paie qu'une fois.
  const [roundId, setRoundId] = useState<string | null>(null);
  const [value, setValue] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const amount = Number.parseInt(value, 10);
  const valid = Number.isInteger(amount) && amount >= MIN && amount <= MAX;
  const clamp = (n: number) => Math.min(MAX, Math.max(MIN, n));

  function openSheet() {
    setRoundId(crypto.randomUUID());
    setValue("10");
    setError(null);
    setOpen(true);
  }

  function offer() {
    if (!roundId || !valid) return;
    start(async () => {
      const result = await offerRoundAction(leagueId, roundId, amount);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={openSheet}>
        <GiftIcon size={18} />
        Tournée générale
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Tournée générale">
        <p className="text-body text-ink-muted">
          Le même montant pour chaque membre, sans exception.
        </p>
        <div className="flex items-center justify-between gap-4">
          <IconButton
            label="Retirer une clope"
            variant="outlined"
            size="lg"
            disabled={valid && amount <= MIN}
            onClick={() => setValue((v) => String(clamp((Number.parseInt(v, 10) || MIN) - 1)))}
          >
            <MinusIcon size={22} />
          </IconButton>
          <label className="flex flex-col items-center">
            <input
              inputMode="numeric"
              aria-label="Clopes par membre"
              value={value}
              onChange={(e) => {
                setValue(e.target.value.replace(/[^0-9]/g, "").slice(0, 3));
                setError(null);
              }}
              onBlur={() => setValue(String(clamp(valid ? amount : MIN)))}
              className="w-[120px] bg-transparent text-center font-mono text-[44px] leading-[48px] font-medium"
            />
            <span className="text-caption text-ink-muted">
              {valid && amount <= 1 ? "clope par membre" : "clopes par membre"}
            </span>
          </label>
          <IconButton
            label="Ajouter une clope"
            variant="outlined"
            size="lg"
            disabled={valid && amount >= MAX}
            onClick={() => setValue((v) => String(clamp((Number.parseInt(v, 10) || MIN) + 1)))}
          >
            <PlusIcon size={22} />
          </IconButton>
        </div>
        <div className="flex justify-between font-mono text-[13px] leading-[18px] font-medium text-ink-muted">
          <span>
            {members} {members > 1 ? "membres" : "membre"} × {valid ? amount : "–"}
          </span>
          <span>
            {valid
              ? `${countOf(members * amount)} ${members * amount > 1 ? "créées" : "créée"}`
              : ""}
          </span>
        </div>
        {error && <FieldError id="round-error">{error}</FieldError>}
        <p className="text-caption text-ink-muted">Inscrite au journal de la ligue.</p>
        <Button onClick={offer} disabled={pending || !valid}>
          Offrir la tournée
        </Button>
      </BottomSheet>
    </>
  );
}
