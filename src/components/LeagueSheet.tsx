"use client";

import { useState } from "react";
import { LeagueRow, type LeagueSummary } from "@/components/LeagueRow";
import { BottomSheet, Button, LeagueSwitcher } from "@/components/ui";

/** Sélecteur de ligue et feuille « Tes ligues ». */
export function LeagueSheet({ current, leagues }: { current: string; leagues: LeagueSummary[] }) {
  const [open, setOpen] = useState(false);
  const active = leagues.find((l) => l.id === current);

  return (
    <>
      <LeagueSwitcher name={active?.name ?? ""} onClick={() => setOpen(true)} />
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Tes ligues">
        <div className="flex flex-col gap-2">
          {leagues.map((league) => (
            <LeagueRow
              key={league.id}
              league={league}
              active={league.id === current}
              href={`/l/${league.id}/paris`}
            />
          ))}
        </div>
        <p className="text-caption text-ink-muted">
          Un solde par ligue : tes clopes ne passent pas d&apos;une ligue à l&apos;autre.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" href="/j">
            Rejoindre
          </Button>
          <Button variant="secondary" href="/ligues/nouvelle">
            Créer une ligue
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
