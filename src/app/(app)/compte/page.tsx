import type { Metadata } from "next";
import { ProfileRows } from "@/components/account/AccountSettings";
import { PhotoRow } from "@/components/account/PhotoRow";
import { ListGroup, ListRow, SectionTitle } from "@/components/List";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { isUuid, memberOrNotFound, requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { getLeague } from "@/server/leagues";
import { getNotifyLevel } from "@/server/notifications";
import { NotificationSettings } from "@/components/account/NotificationSettings";
import { PushSwitch } from "@/components/account/PushSwitch";
import { SignOutButton } from "@/components/account/SignOutButton";
import { pushEnabled } from "@/server/push";

export const metadata: Metadata = { title: "Réglages · JentApp" };

/** La ligue d'où l'on vient, si on en est toujours membre. */
async function fromLeague(userId: string, ligue: unknown): Promise<string | null> {
  if (typeof ligue !== "string" || !isUuid(ligue)) return null;
  try {
    await memberOrNotFound(userId, ligue);
    return ligue;
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

export default async function AccountPage({ searchParams }: PageProps<"/compte">) {
  const user = await requireUser("/compte");
  const league = await fromLeague(user.id, (await searchParams).ligue);
  const suffix = league ? `?ligue=${league}` : "";
  const notifications = league
    ? {
        name: (await getLeague(user, league)).name,
        level: await getNotifyLevel(user, league),
      }
    : null;

  return (
    <Screen>
      <ScreenHeader back={league ? `/l/${league}/moi` : "/"} title="Réglages" />
      <main className="flex grow flex-col gap-3 px-5 pt-2 pb-6">
        <SectionTitle>PROFIL</SectionTitle>
        <ProfileRows
          username={user.username}
          email={user.email}
          photoRow={<PhotoRow username={user.username} image={user.image} />}
        />
        {league && notifications && (
          <>
            <SectionTitle>NOTIFICATIONS DANS {notifications.name.toUpperCase()}</SectionTitle>
            <NotificationSettings
              leagueId={league}
              level={notifications.level}
              push={<PushSwitch enabled={pushEnabled()} returnTo={`/compte?ligue=${league}`} />}
            />
          </>
        )}
        <SectionTitle>
          {league ? "LIGUE, PLATEFORME, AIDE" : user.isSuperAdmin ? "PLATEFORME, AIDE" : "AIDE"}
        </SectionTitle>
        <ListGroup>
          {league && <ListRow label="Réglages de la ligue" href={`/l/${league}/reglages`} />}
          {user.isSuperAdmin && (
            <ListRow label="Catalogue" value="super-admin" href="/admin/catalogue" />
          )}
          <ListRow label="Aide, légal et compte" href={`/compte/aide${suffix}`} />
        </ListGroup>
        <SignOutButton />
      </main>
    </Screen>
  );
}
