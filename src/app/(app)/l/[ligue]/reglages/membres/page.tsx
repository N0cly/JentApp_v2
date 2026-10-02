import type { Metadata } from "next";
import { enterLeague } from "@/app/(app)/l/[ligue]/enter-league";
import { MemberList } from "@/components/league/MemberList";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui";
import { getLeague, listMembers } from "@/server/leagues";

export const metadata: Metadata = { title: "Membres · JentApp" };

export default async function MembersPage({ params }: PageProps<"/l/[ligue]/reglages/membres">) {
  const { ligue } = await params;
  const { user, membership } = await enterLeague(ligue);
  const [league, members] = await Promise.all([getLeague(user, ligue), listMembers(user, ligue)]);

  return (
    <Screen>
      <ScreenHeader back={`/l/${ligue}/reglages`} title={`Membres · ${members.length}`} />
      <main className="flex grow flex-col gap-4 px-5 pt-2 pb-6">
        <MemberList
          leagueId={ligue}
          leagueName={league.name}
          members={members.map((m) => ({
            userId: m.userId,
            username: m.username,
            image: m.image,
            role: m.role,
          }))}
          me={user.id}
          isOwner={membership.role === "owner"}
        />
        <div className="grow" />
        <Button href={`/l/${ligue}/inviter`}>Inviter des membres</Button>
      </main>
    </Screen>
  );
}
