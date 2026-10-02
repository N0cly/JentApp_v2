import type { Metadata } from "next";
import { enterLeague } from "@/app/(app)/l/[ligue]/enter-league";
import { LeagueSettings } from "@/components/league/LeagueSettings";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getLeague, listMembers } from "@/server/leagues";

export const metadata: Metadata = { title: "Réglages de la ligue · JentApp" };

export default async function LeagueSettingsPage({ params }: PageProps<"/l/[ligue]/reglages">) {
  const { ligue } = await params;
  const { user, membership } = await enterLeague(ligue);
  const league = await getLeague(user, ligue);
  const isOwner = membership.role === "owner";
  const others = isOwner
    ? (await listMembers(user, ligue))
        .filter((m) => m.userId !== user.id)
        .map((m) => ({ userId: m.userId, username: m.username }))
    : [];

  return (
    <Screen>
      <ScreenHeader back={`/compte?ligue=${ligue}`} title={`Réglages de ${league.name}`} />
      <main className="flex grow flex-col gap-3 px-5 pt-2 pb-6">
        <LeagueSettings league={league} isOwner={isOwner} others={others} />
      </main>
    </Screen>
  );
}
