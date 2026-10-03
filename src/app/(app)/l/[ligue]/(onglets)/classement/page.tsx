import type { Metadata } from "next";
import { enterLeague } from "@/app/(app)/l/[ligue]/enter-league";
import { LeagueTopBar } from "@/components/LeagueTopBar";
import { RankingBoard, type BoardRow } from "@/components/ranking/RankingBoard";
import { RefreshAt } from "@/components/RefreshAt";
import { getRanking, nextRankingChange, type RankingRow } from "@/server/stats";

export const metadata: Metadata = { title: "Classement · JentApp" };

const toBoard = (r: RankingRow): BoardRow => ({
  userId: r.userId,
  username: r.username,
  image: r.image,
  ring: r.ring,
  balance: r.balance,
  net: r.stats.net,
  rank: r.rank,
});

export default async function RankingPage({ params }: PageProps<"/l/[ligue]/classement">) {
  const { ligue } = await params;
  const { user } = await enterLeague(ligue);
  const now = new Date();
  const [fortune, net, next] = await Promise.all([
    getRanking(user, ligue, "fortune", now),
    getRanking(user, ligue, "net", now),
    nextRankingChange(ligue, now),
  ]);
  return (
    <>
      <header className="flex shrink-0 flex-col gap-1 px-5 py-3">
        <LeagueTopBar userId={user.id} leagueId={ligue} showBalance />
        <h1 className="text-title">Classement</h1>
      </header>
      <RankingBoard
        leagueId={ligue}
        me={user.id}
        fortune={fortune.rows.map(toBoard)}
        net={net.rows.map(toBoard)}
        card={fortune.card}
      />
      {/*
        Les signaux bet.changed et member.changed relisent la page (LiveRefresh,
        layout de la ligue). Un versement n'a lieu qu'à la lecture : à son
        échéance, cette relecture le déclenche, et le signal suit chez les autres.
      */}
      {next && <RefreshAt key={next.getTime()} until={next} />}
    </>
  );
}
