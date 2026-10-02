import type { Metadata } from "next";
import { enterLeague } from "@/app/(app)/l/[ligue]/enter-league";
import { EmailBanner } from "@/components/EmailBanner";
import { EmptyState } from "@/components/EmptyState";
import { LeagueTopBar } from "@/components/LeagueTopBar";

export const metadata: Metadata = { title: "Paris · JentApp" };

export default async function BetsPage({ params, searchParams }: PageProps<"/l/[ligue]/paris">) {
  const { ligue } = await params;
  const { user } = await enterLeague(ligue);
  const expired = (await searchParams).lien === "expire";

  return (
    <>
      <header className="flex shrink-0 flex-col gap-1 px-5 py-3">
        <LeagueTopBar userId={user.id} leagueId={ligue} />
        <h1 className="text-title">Paris</h1>
      </header>
      {!user.emailVerified && (
        <div className="px-5 pb-4">
          <EmailBanner email={user.email} expired={expired} />
        </div>
      )}
      <EmptyState>Rien d&apos;ouvert pour l&apos;instant.</EmptyState>
    </>
  );
}
