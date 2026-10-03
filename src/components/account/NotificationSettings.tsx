"use client";

import { useState, useTransition, type ReactNode } from "react";
import { setNotifyLevelAction } from "@/app/(app)/compte/actions";
import { cx } from "@/lib/cx";
import type { NotifyLevel } from "@/server/notifications";

const levels: { value: NotifyLevel; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "results_mentions", label: "Résultats et mentions" },
  { value: "none", label: "Rien" },
];

/** Section « Notifications dans {ligue} » des réglages (reglages-du-compte.html). */
export function NotificationSettings({
  leagueId,
  level: initial,
  push,
}: {
  leagueId: string;
  level: NotifyLevel;
  /** Ligne « Notifications push », pour cet appareil (masquée sans push). */
  push?: ReactNode;
}) {
  const [level, setLevel] = useState(initial);
  const [, startTransition] = useTransition();
  const choose = (value: NotifyLevel) => {
    setLevel(value);
    startTransition(() => setNotifyLevelAction(leagueId, value));
  };
  return (
    <div
      role="radiogroup"
      aria-label="Niveau de notifications"
      className="flex shrink-0 flex-col rounded-md bg-surface px-4 [&>*+*]:border-t [&>*+*]:border-line"
    >
      {levels.map((l) => {
        const on = level === l.value;
        return (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => choose(l.value)}
            className="flex min-h-[52px] w-full items-center gap-3 py-1 text-left"
          >
            <span
              className={cx(
                "flex size-[20px] shrink-0 items-center justify-center rounded-full border-2",
                on ? "border-brand" : "border-line-strong",
              )}
            >
              {on && <span className="size-[10px] rounded-full bg-brand" />}
            </span>
            <span className="text-[15px] leading-5 font-semibold">{l.label}</span>
          </button>
        );
      })}
      {push}
    </div>
  );
}
