import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { enterLeague } from "@/app/(app)/l/[ligue]/enter-league";
import {
  ClosedBet,
  OpenBet,
  ResolvedBet,
  ScheduledBet,
  SettledBet,
} from "@/components/bets/BetScreens";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getBet, settleDelayMs } from "@/server/bets";
import { isUuid } from "@/server/auth";
import { getMyBalance } from "@/server/leagues";

export const metadata: Metadata = { title: "Pari · JentApp" };

const titles = {
  scheduled: "Pari",
  open: "Pari",
  closed: "Pari",
  resolved: "Résultat saisi",
  settled: "Pari réglé",
  cancelled: "Pari annulé",
} as const;

export default async function BetPage({
  params,
  searchParams,
}: PageProps<"/l/[ligue]/paris/[pari]">) {
  const { ligue, pari } = await params;
  const { user } = await enterLeague(ligue);
  if (!isUuid(pari)) notFound();
  const view = await getBet(user, ligue, pari, new Date());
  const correcting =
    (await searchParams).corriger === "1" &&
    view.state === "resolved" &&
    view.permissions.canCorrect;
  const delayMinutes = Math.max(1, Math.round(settleDelayMs() / 60_000));

  const title =
    correcting || (view.state === "closed" && view.permissions.canResolve)
      ? "Saisir le résultat"
      : titles[view.state];

  let content;
  if (view.state === "scheduled") content = <ScheduledBet leagueId={ligue} view={view} />;
  else if (view.state === "open") {
    const { balance } = await getMyBalance(user, ligue);
    content = <OpenBet leagueId={ligue} view={view} balance={balance} />;
  } else if (view.state === "closed" || correcting) {
    content = (
      <ClosedBet leagueId={ligue} view={view} correcting={correcting} delayMinutes={delayMinutes} />
    );
  } else if (view.state === "resolved") {
    content = <ResolvedBet leagueId={ligue} view={view} delayMinutes={delayMinutes} />;
  } else content = <SettledBet view={view} />;

  return (
    <Screen>
      <ScreenHeader
        back={correcting ? `/l/${ligue}/paris/${pari}` : `/l/${ligue}/paris`}
        title={title}
      />
      <main className="flex grow flex-col gap-4 px-5 pt-2 pb-6">{content}</main>
    </Screen>
  );
}
