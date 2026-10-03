"use client";

import { useState } from "react";
import {
  Amount,
  BetOption,
  BottomSheet,
  Button,
  Chip,
  Countdown,
  LeagueBadge,
  LeagueSwitcher,
  Segmented,
} from "@/components/ui";
import { sample } from "./sample";

const MINUTE = 60 * 1000;

export function CountdownDemo() {
  // Échéances relatives à l'ouverture de la page, calculées dans le navigateur.
  const [base] = useState(() => Date.now());
  return (
    <div className="flex flex-col gap-2">
      <Countdown kind="closes" until={new Date(base + 102 * MINUTE + 10_000)} />
      <Countdown kind="closes" until={new Date(base + 42 * MINUTE)} />
      <Countdown kind="opens" until={new Date(base + 35 * MINUTE + 12_000)} />
      <Countdown kind="payout" until={new Date(base + 8 * MINUTE + 12_000)} />
    </div>
  );
}

export function CardCountdown() {
  const [until] = useState(() => new Date(Date.now() + 102 * MINUTE + 10_000));
  return <Countdown kind="closes" until={until} />;
}

const moments = ["Tous", "Before", "Night", "After", "Daily", "Spécial"] as const;

export function ChipDemo() {
  const [selected, setSelected] = useState<string>("Tous");
  return (
    <div className="flex flex-wrap gap-2">
      {moments.map((moment) => (
        <Chip key={moment} selected={moment === selected} onClick={() => setSelected(moment)}>
          {moment}
        </Chip>
      ))}
    </div>
  );
}

export function SegmentedDemo() {
  const [ranking, setRanking] = useState<"fortune" | "net">("fortune");
  const [tab, setTab] = useState<"history" | "achievements" | "cosmetics">("history");
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Classement"
        value={ranking}
        onChange={setRanking}
        options={[
          { value: "fortune", label: "Fortune" },
          { value: "net", label: "Bilan net" },
        ]}
      />
      <Segmented
        label="Moi"
        value={tab}
        onChange={setTab}
        options={[
          { value: "history", label: "Historique" },
          { value: "achievements", label: "Succès" },
          { value: "cosmetics", label: "Cosmétiques" },
        ]}
      />
    </div>
  );
}

export function ChoiceDemo() {
  const [winner, setWinner] = useState<string>("Non");
  return (
    <div className="flex flex-col gap-2">
      {[
        { label: "Oui", meta: "9 clopes · 2 mises" },
        { label: "Non", meta: "8 clopes · 2 mises" },
      ].map((option) => (
        <BetOption
          key={option.label}
          label={option.label}
          meta={option.meta}
          choice={{ selected: winner === option.label }}
          onClick={() => setWinner(option.label)}
        />
      ))}
    </div>
  );
}

export function LeagueSheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <LeagueSwitcher name={sample.league} onClick={() => setOpen(true)} />
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Tes ligues">
        <div className="flex flex-col gap-2">
          {sample.leagues.map((league) => (
            <button
              key={league.name}
              type="button"
              aria-current={league.active ? "true" : undefined}
              onClick={() => setOpen(false)}
              className={
                league.active
                  ? "flex min-h-[68px] items-center gap-3 rounded-md border-[1.5px] border-brand bg-brand-soft px-4 text-left"
                  : "flex min-h-[68px] items-center gap-3 rounded-md border-[1.5px] border-surface bg-surface px-4 text-left"
              }
            >
              <LeagueBadge name={league.name} active={league.active} />
              <span className="flex min-w-0 grow flex-col">
                <span className="text-[16px] leading-5 font-bold">{league.name}</span>
                <span className="text-caption text-ink-muted">
                  {league.members} membres{league.active && " · ligue active"}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <Amount value={league.balance} />
                <span
                  className={
                    league.open === "rien d'ouvert"
                      ? "text-caption text-ink-muted"
                      : "text-caption text-brand"
                  }
                >
                  {league.open}
                </span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-caption text-ink-muted">
          Un solde par ligue : tes clopes ne passent pas d&apos;une ligue à l&apos;autre.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary">Rejoindre</Button>
          <Button variant="secondary">Créer une ligue</Button>
        </div>
      </BottomSheet>
    </>
  );
}
