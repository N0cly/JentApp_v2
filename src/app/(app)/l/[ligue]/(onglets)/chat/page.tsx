import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { LeagueTopBar } from "@/components/LeagueTopBar";
import { requireMember } from "@/server/auth";

export const metadata: Metadata = { title: "Chat · JentApp" };

export default async function ChatPage({ params }: PageProps<"/l/[ligue]/chat">) {
  const { ligue } = await params;
  const { user } = await requireMember(ligue);
  return (
    <>
      <header className="flex shrink-0 flex-col gap-1 px-5 py-3">
        <LeagueTopBar userId={user.id} leagueId={ligue} />
        <h1 className="text-title">Chat</h1>
      </header>
      <EmptyState>Le chat arrive bientôt.</EmptyState>
    </>
  );
}
