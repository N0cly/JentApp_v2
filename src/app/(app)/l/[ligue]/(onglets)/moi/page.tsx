import type { Metadata } from "next";
import { enterLeague } from "@/app/(app)/l/[ligue]/enter-league";
import { BalanceCard } from "@/components/BalanceCard";
import { LeagueTopBar } from "@/components/LeagueTopBar";
import { HistoryList } from "@/components/stats/HistoryList";
import { StatGrid } from "@/components/stats/StatGrid";
import { rankLabel } from "@/lib/rank";
import { getLeague } from "@/server/leagues";
import { getMyHistory, getProfile } from "@/server/stats";
import Link from "next/link";
import { AchievementList } from "@/components/achievements/AchievementList";
import { MyCosmetics } from "@/components/shop/MyCosmetics";
import { myAchievements } from "@/server/achievements";
import { myCosmetics } from "@/server/shop";
import { Avatar, IconButton, SegmentedLinks, SettingsIcon, ShopIcon } from "@/components/ui";

type Tab = "historique" | "succes" | "cosmetiques";

export const metadata: Metadata = { title: "Moi · JentApp" };

export default async function MePage({ params, searchParams }: PageProps<"/l/[ligue]/moi">) {
  const { ligue } = await params;
  const asked = (await searchParams).onglet;
  const tab: Tab = asked === "succes" || asked === "cosmetiques" ? asked : "historique";
  const { user } = await enterLeague(ligue);
  const now = new Date();
  // Mon profil, lu comme les autres le lisent : mêmes rang, solde et bilan.
  const [league, me] = await Promise.all([
    getLeague(user, ligue),
    getProfile(user, ligue, user.id, now),
  ]);
  const base = `/l/${ligue}/moi`;

  let content;
  if (tab === "succes") {
    const mine = await myAchievements(user, ligue);
    content = <AchievementList {...mine} leagueName={league.name} />;
  } else if (tab === "cosmetiques") {
    const mine = await myCosmetics(user, ligue);
    content = (
      <MyCosmetics leagueId={ligue} {...mine} me={{ username: user.username, photo: user.image }} />
    );
  } else {
    const history = await getMyHistory(user, ligue, 0, now);
    content = (
      <HistoryList leagueId={ligue} initial={history.items} initialHasMore={history.hasMore} />
    );
  }
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
        <Avatar
          name={user.username}
          src={me.image}
          ring={me.ring ?? undefined}
          ringWidth={me.ring ? 3 : 2}
          size={56}
        />
        <div className="flex grow flex-col">
          <h1 className="text-[24px] leading-[28px] font-extrabold tracking-[-0.01em] [font-stretch:85%]">
            {user.username}
          </h1>
          <span className="text-caption text-ink-muted">{rankLabel(me.rank)} de la ligue</span>
        </div>
      </header>
      <main className="flex flex-col gap-3 px-5 pb-5">
        <BalanceCard
          leagueName={league.name}
          balance={me.balance}
          action={
            <Link
              href={`/l/${ligue}/boutique`}
              className="flex min-h-[44px] items-center gap-2 rounded-md border border-line-strong bg-surface-raised px-3 text-[14px] leading-5 font-bold"
            >
              <ShopIcon size={18} />
              Boutique
            </Link>
          }
        />
        <StatGrid stats={me.stats} />
        <SegmentedLinks
          label="Vue de Moi"
          className="shrink-0"
          options={[
            { href: base, label: "Historique", active: tab === "historique" },
            { href: `${base}?onglet=succes`, label: "Succès", active: tab === "succes" },
            {
              href: `${base}?onglet=cosmetiques`,
              label: "Cosmétiques",
              active: tab === "cosmetiques",
            },
          ]}
        />
        {content}
      </main>
    </>
  );
}
