import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { enterLeague } from "@/app/(app)/l/[ligue]/enter-league";
import { BetFormClient } from "@/components/bets/BetFormClient";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { isUuid } from "@/server/auth";
import { getBet } from "@/server/bets";

export const metadata: Metadata = { title: "Modifier le pari · JentApp" };

export default async function EditBetPage({
  params,
}: PageProps<"/l/[ligue]/paris/[pari]/modifier">) {
  const { ligue, pari } = await params;
  const { user } = await enterLeague(ligue);
  if (!isUuid(pari)) notFound();
  const view = await getBet(user, ligue, pari, new Date());
  if (!view.permissions.canEdit || (view.state !== "scheduled" && view.state !== "open"))
    notFound();
  if (view.state === "scheduled" && view.mystery) notFound();

  return (
    <Screen>
      <ScreenHeader back={`/l/${ligue}/paris/${pari}`} title="Modifier le pari" />
      <main className="flex grow flex-col px-5 pt-2 pb-6">
        <BetFormClient
          leagueId={ligue}
          betId={pari}
          initial={{
            question: view.question,
            options: view.options.map((o) => o.label),
            moment: view.moment,
            opensAt: view.state === "scheduled" ? view.opensAt : null,
            closesAt: view.closesAt,
            hiddenUntilOpen: view.hiddenUntilOpen,
            opened: view.state === "open",
          }}
        />
      </main>
    </Screen>
  );
}
