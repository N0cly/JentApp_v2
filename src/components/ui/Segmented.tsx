"use client";

import Link from "next/link";
import { cx } from "@/lib/cx";

type SegmentedProps<T extends string> = {
  /** Nom de la bascule, lu par les lecteurs d'écran. */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx("grid gap-1 rounded-md bg-surface p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cx(
              "min-h-[44px] rounded-md text-[14px] leading-5 font-semibold",
              active ? "bg-ink text-on-paper" : "bg-surface text-ink-muted",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Même bascule, quand chaque vue a son adresse (onglets de Moi). */
export function SegmentedLinks({
  label,
  options,
  className,
}: {
  label: string;
  options: readonly { href: string; label: string; active: boolean }[];
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cx("grid gap-1 rounded-md bg-surface p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          aria-current={option.active ? "true" : undefined}
          className={cx(
            "flex min-h-[44px] items-center justify-center rounded-md text-[14px] leading-5 font-semibold",
            option.active ? "bg-ink text-on-paper" : "bg-surface text-ink-muted",
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
