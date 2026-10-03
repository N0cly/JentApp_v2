import type { Metadata } from "next";
import { enterLeague } from "@/app/(app)/l/[ligue]/enter-league";
import { BalanceCard } from "@/components/BalanceCard";
import { LeagueTopBar } from "@/components/LeagueTopBar";
import { HistoryList } from "@/components/stats/HistoryList";
import { StatGrid } from "@/components/stats/StatGrid";
import { rankLabel } from "@/lib/rank";
import { getLeague } from "@/server/leagues";
import { getMyHistory, getProfile } from "@/server/stats";
import { Avatar, IconButton, SettingsIcon } from "@/components/ui";

export const metadata: Metadata = { title: "Moi · JentApp" };

export default async function MePage({ params }: PageProps<"/l/[ligue]/moi">) {
  const { ligue } = await params;
  const { user } = await enterLeague(ligue);
  const now = new Date();
  // Mon profil, lu comme les autres le lisent : mêmes rang, solde et bilan.
  const [league, me, history] = await Promise.all([
    getLeague(user, ligue),
    getProfile(user, ligue, user.id, now),
    getMyHistory(user, ligue, 0, now),
  ]);
  return (
    <>
      <div className="shrink-0 px-5 pt-3">
        <LeagueTopBar
          userId={user.id}
          leagueId={ligue}
          action={
            <IconButton label="Réglages" variant="outlined" href={`/compte?ligue=${ligue}`}>
              <SettingsIcon size={20} />
            </IconButton>
          }
        />
      </div>
      <header className="flex shrink-0 items-center gap-3 px-5 pt-3 pb-4">
        <Avatar name={user.username} src={user.image} size={56} />
        <div className="flex grow flex-col">
          <h1 className="text-[24px] leading-[28px] font-extrabold tracking-[-0.01em] [font-stretch:85%]">
            {user.username}
          </h1>
          <span className="text-caption text-ink-muted">{rankLabel(me.rank)} de la ligue</span>
        </div>
      </header>
      <main className="flex flex-col gap-3 px-5 pb-5">
        <BalanceCard leagueName={league.name} balance={me.balance} />
        <StatGrid stats={me.stats} />
        {/* Le Segmented Historique / Succès / Cosmétiques arrive avec M6. */}
        <h2 className="text-overline pt-2 text-ink-subtle">HISTORIQUE</h2>
        <HistoryList leagueId={ligue} initial={history.items} initialHasMore={history.hasMore} />
      </main>
    </>
  );
}
