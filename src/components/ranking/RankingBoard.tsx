"use client";

import Link from "next/link";
import { useState } from "react";
import { useProfileSheet } from "@/components/stats/ProfileSheet";
import { Amount, Avatar, Segmented } from "@/components/ui";
import { cx } from "@/lib/cx";
import { countOf } from "@/lib/units";
import type { RankingCard as Card } from "@/server/stats";

export type BoardRow = {
  userId: string;
  username: string;
  image: string | null;
  /** Bordure portée. */
  ring: string | null;
  balance: number;
  net: number;
  rank: number;
};

type View = "fortune" | "net";

const views = [
  { value: "fortune", label: "Fortune" },
  { value: "net", label: "Bilan net" },
] as const;

/** Valeur d'une ligne : le solde, ou le bilan signé en vue Bilan net. */
function Value({ row, view }: { row: BoardRow; view: View }) {
  return view === "fortune" ? <Amount value={row.balance} /> : <Amount value={row.net} delta />;
}

function You() {
  return <span className="text-overline text-ink-muted">TOI</span>;
}

const podium = {
  1: {
    avatar: 72,
    width: 3,
    block: "h-[124px] bg-brand-soft",
    tone: "text-brand",
  },
  2: {
    avatar: 56,
    width: 2,
    block: "h-[84px] bg-surface",
    tone: "text-ink-muted",
  },
  3: {
    avatar: 56,
    width: 2,
    block: "h-[64px] bg-surface",
    tone: "text-ink-muted",
  },
} as const;

function Podium({
  rows,
  view,
  me,
  leagueId,
  onOpen,
}: {
  rows: BoardRow[];
  view: View;
  me: string;
  leagueId: string;
  onOpen?: (userId: string) => void;
}) {
  // Deuxième, premier, troisième : seulement les places occupées.
  const places = [rows[1], rows[0], rows[2]].filter((r): r is BoardRow => r !== undefined);
  return (
    <div className="flex shrink-0 items-end gap-2">
      {places.map((row) => {
        const style = podium[row.rank as 1 | 2 | 3];
        const className = "flex min-w-0 flex-1 flex-col items-center gap-1";
        const content = (
          <>
            <Avatar
              name={row.username}
              src={row.image}
              size={style.avatar}
              ring={row.ring ?? undefined}
              ringWidth={style.width}
            />
            <span className="max-w-full truncate text-[13px] leading-[18px] font-semibold">
              {row.username}
            </span>
            <Value row={row} view={view} />
            <span
              className={cx(
                "flex flex-col items-center gap-1 self-stretch rounded-t-md pt-2",
                style.block,
              )}
            >
              <span className={cx("font-mono text-[28px] leading-8 font-medium", style.tone)}>
                {row.rank}
              </span>
              {row.userId === me && <You />}
            </span>
          </>
        );
        return row.userId === me ? (
          <Link key={row.userId} href={`/l/${leagueId}/moi`} className={className}>
            {content}
          </Link>
        ) : (
          <button
            key={row.userId}
            type="button"
            className={className}
            onClick={() => onOpen?.(row.userId)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

/** Carte sous ma ligne, vue Fortune (docs/M5.md, § Classement). */
function StandingCard({ card, leagueId }: { card: Card; leagueId: string }) {
  let title: string;
  let detail: string | null = null;
  let action: { href: string; label: string } | null = null;
  if (card.kind === "alone") {
    title = "Personne d'autre ici. Invite la bande.";
    action = { href: `/l/${leagueId}/inviter`, label: "Inviter" };
  } else {
    title =
      card.kind === "leader"
        ? card.lead === 0
          ? `Tu partages la tête avec ${card.rival}.`
          : `Tu mènes la ligue. ${countOf(card.lead)} d'avance sur ${card.rival}.`
        : card.gap === 0
          ? `À égalité avec ${card.rival}`
          : `${countOf(card.gap)} derrière ${card.rival}`;
    if (card.openBets > 0) {
      const bets = card.openBets === 1 ? "1 pari ouvert" : `${card.openBets} paris ouverts`;
      detail = `${bets} ${card.kind === "leader" ? "pour creuser l'écart" : "pour le doubler"}`;
      action = { href: `/l/${leagueId}/paris`, label: "Parier" };
    }
  }
  return (
    <div className="flex shrink-0 items-center gap-3 rounded-lg bg-surface p-4">
      <div className="flex grow flex-col gap-1">
        <span className="text-[16px] leading-5 font-bold">{title}</span>
        {detail && <span className="text-caption text-ink-subtle">{detail}</span>}
      </div>
      {action && (
        <Link
          href={action.href}
          className="flex min-h-[44px] shrink-0 items-center rounded-md bg-brand px-4 text-[14px] leading-5 font-bold text-on-brand"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

function Row({
  row,
  view,
  me,
  leagueId,
  onOpen,
}: {
  row: BoardRow;
  view: View;
  me: string;
  leagueId: string;
  onOpen?: (userId: string) => void;
}) {
  const mine = row.userId === me;
  const className = "flex min-h-[60px] items-center gap-3 rounded-md bg-surface px-4 text-left";
  const content = (
    <>
      <span className="flex min-w-4 flex-col items-center">
        <span className="font-mono text-[15px] leading-5 font-medium text-ink-subtle">
          {row.rank}
        </span>
        {mine && <You />}
      </span>
      <Avatar
        name={row.username}
        src={row.image}
        ring={row.ring ?? undefined}
        size={36}
        background="surface-raised"
      />
      <span className="min-w-0 grow truncate text-[15px] leading-5 font-semibold">
        {row.username}
      </span>
      <Value row={row} view={view} />
    </>
  );
  // Ma ligne mène à l'onglet Moi ; les autres ouvrent le profil.
  if (mine) {
    return (
      <Link href={`/l/${leagueId}/moi`} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={() => onOpen?.(row.userId)}>
      {content}
    </button>
  );
}

/** Classement : bascule Fortune / Bilan net, podium, carte sous ma ligne, liste. */
export function RankingBoard({
  leagueId,
  me,
  fortune,
  net,
  card,
}: {
  leagueId: string;
  me: string;
  fortune: BoardRow[];
  net: BoardRow[];
  card: Card | null;
}) {
  const profile = useProfileSheet(leagueId);
  const onOpen = profile.open;
  const [view, setView] = useState<View>("fortune");
  const rows = view === "fortune" ? fortune : net;
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  const shownCard = view === "fortune" ? card : null;
  const mineInPodium = top.some((r) => r.userId === me);

  return (
    <>
      <Segmented
        label="Vue du classement"
        options={views}
        value={view}
        onChange={setView}
        className="mx-5 mb-5 shrink-0"
      />
      <main className="flex flex-col gap-3 px-5 pb-5">
        <Podium rows={top} view={view} me={me} leagueId={leagueId} onOpen={onOpen} />
        {shownCard && mineInPodium && <StandingCard card={shownCard} leagueId={leagueId} />}
        {rest.length > 0 && (
          <div className="flex flex-col gap-2">
            {rest.map((row) => (
              <div key={row.userId} className="contents">
                <Row row={row} view={view} me={me} leagueId={leagueId} onOpen={onOpen} />
                {shownCard && row.userId === me && (
                  <StandingCard card={shownCard} leagueId={leagueId} />
                )}
              </div>
            ))}
          </div>
        )}
      </main>
      {profile.sheet}
    </>
  );
}
