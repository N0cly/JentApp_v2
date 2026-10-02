import type { Metadata } from "next";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ShareInvite } from "@/components/ShareInvite";
import {
  Button,
  Ticket,
  TicketCut,
  TicketOverline,
  TicketRow,
  TicketSection,
} from "@/components/ui";
import { requireMember } from "@/server/auth";
import { getLeague } from "@/server/leagues";

export const metadata: Metadata = { title: "Inviter · JentApp" };

export default async function InvitePage({
  params,
  searchParams,
}: PageProps<"/l/[ligue]/inviter">) {
  const { ligue } = await params;
  const { user } = await requireMember(ligue);
  const league = await getLeague(user, ligue);
  const justCreated = (await searchParams).nouvelle === "1";
  const path = `/j/${league.inviteCode}`;
  const link = `${process.env.APP_URL}${path}?par=${encodeURIComponent(user.username)}`;

  return (
    <Screen>
      <ScreenHeader back={`/l/${ligue}/paris`} title={`Inviter dans ${league.name}`} />
      <main className="flex grow flex-col gap-4 px-5 pt-2 pb-6">
        {justCreated && (
          <h1 className="text-[28px] leading-8 font-extrabold tracking-[-0.02em] [font-stretch:85%]">
            La ligue est prête
          </h1>
        )}
        <p className="text-body text-ink-muted">
          Donne ce code à ta bande. Chacun reçoit {league.joinGrant} clopes en arrivant.
        </p>
        <Ticket behind="bg" className="shrink-0">
          <TicketSection>
            <TicketOverline end={league.name.toUpperCase()}>INVITATION</TicketOverline>
            <div className="py-2 text-center font-mono text-[40px] leading-[48px] font-medium tracking-[0.2em]">
              {league.inviteCode}
            </div>
          </TicketSection>
          <TicketCut />
          <TicketSection>
            <TicketRow label="Lien">{path}</TicketRow>
          </TicketSection>
        </Ticket>
        <div className="grow" />
        <ShareInvite link={link} code={league.inviteCode} leagueName={league.name} />
        <Button variant="discreet" href={`/l/${ligue}/paris`}>
          Aller aux paris
        </Button>
      </main>
    </Screen>
  );
}
