import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { ChevronRightIcon } from "./icons";

type BetOptionProps = {
  label: string;
  /** Ma mise sur cette option : bordure brand, fond brand-soft, rappel « Ta mise ». */
  myStake?: number;
  /** Choix d'une option (saisie du résultat) : pastille radio. */
  choice?: { selected: boolean };
  /** Information à droite, en mono (répartition une fois le pari fermé). */
  meta?: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
};

/** Aucune cote n'est affichée tant que le pari est ouvert. */
export function BetOption({
  label,
  myStake,
  choice,
  meta,
  href,
  onClick,
  className,
}: BetOptionProps) {
  const highlighted = myStake !== undefined || choice?.selected === true;
  const interactive = Boolean(href || onClick);

  const classes = cx(
    "flex w-full items-center justify-between gap-3 rounded-md border-[1.5px] px-4 py-1 text-left",
    choice ? "min-h-[60px]" : "min-h-[52px]",
    highlighted ? "border-brand bg-brand-soft" : "border-surface-raised bg-surface-raised",
    className,
  );

  const content = (
    <>
      <span className="flex items-center gap-3">
        {choice && (
          <span
            aria-hidden="true"
            className={cx(
              "flex size-[20px] shrink-0 items-center justify-center rounded-full border-2",
              choice.selected ? "border-brand" : "border-line-strong",
            )}
          >
            {choice.selected && <span className="size-[10px] rounded-full bg-brand" />}
          </span>
        )}
        <span className="flex flex-col">
          <span className="text-[15px] leading-5 font-semibold">{label}</span>
          {myStake !== undefined && (
            <span className="text-caption text-brand">Ta mise · {myStake}</span>
          )}
        </span>
      </span>
      {meta && <span className="font-mono text-[13px] font-medium text-ink-muted">{meta}</span>}
      {interactive && !choice && !meta && myStake === undefined && (
        <span className="flex text-ink-subtle">
          <ChevronRightIcon size={18} />
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={choice ? choice.selected : undefined}
        className={classes}
      >
        {content}
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}
