import type { Metadata } from "next";
import { signOutAction } from "@/app/(compte)/actions";
import { ProfileRows } from "@/components/account/AccountSettings";
import { PhotoRow } from "@/components/account/PhotoRow";
import { ListGroup, ListRow, SectionTitle } from "@/components/List";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button, SignOutIcon } from "@/components/ui";
import { isUuid, memberOrNotFound, requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";

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
        <form action={signOutAction}>
          <Button variant="secondary" type="submit">
            <SignOutIcon size={18} />
            Se déconnecter
          </Button>
        </form>
      </main>
    </Screen>
  );
}
