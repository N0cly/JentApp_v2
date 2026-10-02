import type { Metadata } from "next";
import { enterLeague } from "@/app/(app)/l/[ligue]/enter-league";
import { BetFormClient } from "@/components/bets/BetFormClient";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";

export const metadata: Metadata = { title: "Nouveau pari · JentApp" };

export default async function NewBetPage({ params }: PageProps<"/l/[ligue]/paris/nouveau">) {
  const { ligue } = await params;
  await enterLeague(ligue);
  return (
    <Screen>
      <ScreenHeader back={`/l/${ligue}/paris`} title="Nouveau pari" />
      <main className="flex grow flex-col px-5 pt-2 pb-6">
        <BetFormClient leagueId={ligue} />
      </main>
    </Screen>
  );
}
