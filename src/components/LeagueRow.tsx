import Link from "next/link";
import { Amount, LeagueBadge } from "@/components/ui";
import { cx } from "@/lib/cx";

export type LeagueSummary = {
  id: string;
  name: string;
  members: number;
  balance: number;
  openBets: number;
};

function openBetsLabel(n: number) {
  if (n === 0) return "rien d'ouvert";
  return n === 1 ? "1 pari ouvert" : `${n} paris ouverts`;
}

/** Ligne d'une ligue : badge, nom, membres ; à droite le solde et les paris ouverts. */
export function LeagueRow({
  league,
  active = false,
  href,
}: {
  league: Omit<LeagueSummary, "id">;
  active?: boolean;
  href?: string;
}) {
  const className = cx(
    "flex min-h-[68px] items-center gap-3 rounded-md border-[1.5px] px-4",
    active ? "border-brand bg-brand-soft" : "border-surface bg-surface",
  );
  const content = (
    <>
      <LeagueBadge name={league.name} active={active} />
      <span className="flex min-w-0 grow flex-col">
        <span className="truncate text-[16px] leading-5 font-bold">{league.name}</span>
        <span className="text-caption text-ink-muted">
          {league.members} {league.members > 1 ? "membres" : "membre"}
          {active && " · ligue active"}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <Amount value={league.balance} />
        <span className={cx("text-caption", league.openBets > 0 ? "text-brand" : "text-ink-muted")}>
          {openBetsLabel(league.openBets)}
        </span>
      </span>
    </>
  );
  if (!href) return <div className={className}>{content}</div>;
  return (
    <Link href={href} aria-current={active ? "true" : undefined} className={className}>
      {content}
    </Link>
  );
}
