import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { LeagueTopBar } from "@/components/LeagueTopBar";
import { requireMember } from "@/server/auth";

export const metadata: Metadata = { title: "Classement · JentApp" };

export default async function RankingPage({ params }: PageProps<"/l/[ligue]/classement">) {
  const { ligue } = await params;
  const { user } = await requireMember(ligue);
  return (
    <>
      <header className="flex shrink-0 flex-col gap-1 px-5 py-3">
        <LeagueTopBar userId={user.id} leagueId={ligue} />
        <h1 className="text-title">Classement</h1>
      </header>
      <EmptyState>Le classement arrive avec les premiers paris.</EmptyState>
    </>
  );
}
