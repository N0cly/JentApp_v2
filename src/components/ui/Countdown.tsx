"use client";

import { useSyncExternalStore } from "react";
import { cx } from "@/lib/cx";
import { ClockIcon } from "./icons";

type Kind = "closes" | "opens" | "payout";

const labels: Record<Kind, string> = {
  closes: "Ferme dans",
  opens: "S'ouvre dans",
  payout: "Versement dans",
};

const HOUR = 3600;

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}

const nowInSeconds = () => Math.floor(Date.now() / 1000);
const noTimeOnServer = () => null;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** hh:mm:ss, ou mm:ss pour le versement (toujours sous 10 minutes). */
export function formatRemaining(seconds: number, kind: Kind): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / HOUR);
  const m = Math.floor((s % HOUR) / 60);
  const rest = s % 60;
  return kind === "payout" ? `${pad(h * 60 + m)}:${pad(rest)}` : `${pad(h)}:${pad(m)}:${pad(rest)}`;
}

/** Secondes restantes jusqu'à `until`, mises à jour chaque seconde ; null au rendu serveur. */
export function useRemaining(until: Date): number | null {
  // L'heure n'existe que dans le navigateur : rien d'affiché au rendu serveur.
  const now = useSyncExternalStore(subscribe, nowInSeconds, noTimeOnServer);
  return now === null ? null : Math.floor(until.getTime() / 1000) - now;
}

type CountdownProps = {
  /** Échéance. */
  until: Date;
  kind: Kind;
  className?: string;
};

export function Countdown({ until, kind, className }: CountdownProps) {
  const remaining = useRemaining(until);

  const tone =
    kind !== "closes"
      ? "text-brand"
      : remaining !== null && remaining < HOUR
        ? "text-loss"
        : "text-ink-muted";

  return (
    <span
      role="timer"
      className={cx("flex items-center gap-1 font-mono text-[13px] font-medium", tone, className)}
    >
      <ClockIcon size={16} />
      {labels[kind]} {remaining === null ? "--:--" : formatRemaining(remaining, kind)}
    </span>
  );
}
