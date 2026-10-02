import type { Metadata } from "next";
import { enterLeague } from "@/app/(app)/l/[ligue]/enter-league";
import { BetList } from "@/components/bets/BetList";
import { EmailBanner } from "@/components/EmailBanner";
import { LeagueTopBar } from "@/components/LeagueTopBar";
import { IconButton, PlusIcon } from "@/components/ui";
import { listBets } from "@/server/bets";
import { getMyBalance } from "@/server/leagues";

export const metadata: Metadata = { title: "Paris · JentApp" };

export default async function BetsPage({ params, searchParams }: PageProps<"/l/[ligue]/paris">) {
  const { ligue } = await params;
  const { user } = await enterLeague(ligue);
  const expired = (await searchParams).lien === "expire";
  const now = new Date();
  const [bets, { balance }] = await Promise.all([
    listBets(user, ligue, now),
    getMyBalance(user, ligue),
  ]);

  return (
    <>
      <header className="flex shrink-0 flex-col gap-1 px-5 py-3">
        <LeagueTopBar
          userId={user.id}
          leagueId={ligue}
          showBalance
          action={
            <IconButton label="Nouveau pari" variant="brand" href={`/l/${ligue}/paris/nouveau`}>
              <PlusIcon size={22} />
            </IconButton>
          }
        />
        <h1 className="text-title">Paris</h1>
      </header>
      {!user.emailVerified && (
        <div className="px-5 pb-4">
          <EmailBanner email={user.email} expired={expired} />
        </div>
      )}
      <BetList leagueId={ligue} bets={bets} balance={balance} />
    </>
  );
}
