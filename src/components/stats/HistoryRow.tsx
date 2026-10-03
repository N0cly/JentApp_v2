"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { RefreshAt } from "@/components/RefreshAt";
import { CheckIcon, ClockIcon, CloseIcon, formatRemaining, useRemaining } from "@/components/ui";
import { cx } from "@/lib/cx";
import { frenchSpacing } from "@/lib/typo";
import type { CancelReason, HistoryItem } from "@/server/stats";

const MINUS = "−";

const cancelReasons: Record<CancelReason, string> = {
  cancelled: "pari annulé",
  tie: "égalité",
  expired: "sans résultat depuis 7 jours",
};

function Remaining({ until, kind }: { until: Date; kind: "closes" | "payout" }) {
  const remaining = useRemaining(until);
  return <>{remaining === null ? "--:--" : formatRemaining(remaining, kind)}</>;
}

/** Ligne d'historique : icône, question, option et mise, valeur à droite (moi.html). */
export function HistoryRow({
  item,
  href,
  onRaised = false,
}: {
  item: HistoryItem;
  href?: string;
  /** Posée sur surface-raised (feuille) : le rond neutre passe en surface. */
  onRaised?: boolean;
}) {
  const { outcome } = item;
  const base = `${item.option} · mise ${item.amount}`;
  let detail: ReactNode = null;
  let value: string;
  let tone = "text-ink-muted";
  let icon = <ClockIcon size={18} />;
  let iconTone = onRaised ? "bg-surface text-ink-muted" : "bg-surface-raised text-ink-muted";

  switch (outcome.kind) {
    case "open":
      detail = (
        <>
          {" · ferme dans "}
          <Remaining until={outcome.closesAt} kind="closes" />
        </>
      );
      value = "en cours";
      break;
    case "closed":
      detail = " · en attente du résultat";
      value = "en attente";
      break;
    case "resolved":
      detail = (
        <>
          {" · versement dans "}
          <Remaining until={outcome.settlesAt} kind="payout" />
          <RefreshAt until={outcome.settlesAt} />
        </>
      );
      value = "en attente";
      break;
    case "won":
      value = `+${outcome.net}`;
      tone = "text-win";
      icon = <CheckIcon size={18} />;
      iconTone = "bg-win-soft text-win";
      break;
    case "lost":
      value = `${MINUS}${-outcome.net}`;
      tone = "text-loss";
      icon = <CloseIcon size={18} />;
      iconTone = "bg-loss-soft text-loss";
      break;
    case "refunded":
      detail = " · personne en face";
      value = "rendu";
      break;
    case "cancelled":
      detail = ` · ${cancelReasons[outcome.reason]}`;
      value = "rendu";
      break;
  }

  const className = "flex min-h-[56px] items-center gap-3";
  const content = (
    <>
      <span
        className={cx(
          "flex size-[36px] shrink-0 items-center justify-center rounded-full",
          iconTone,
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 grow flex-col">
        <span className="truncate text-[15px] leading-5 font-semibold">
          {frenchSpacing(item.question)}
        </span>
        <span className="text-caption text-ink-subtle">
          {base}
          {detail}
        </span>
      </span>
      <span className={cx("shrink-0 font-mono text-[15px] leading-5 font-medium", tone)}>
        {value}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
