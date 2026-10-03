import type { Metadata } from "next";
import { enterLeague } from "@/app/(app)/l/[ligue]/enter-league";
import { ChatClient } from "@/components/chat/ChatClient";
import { Presence } from "@/components/chat/Presence";
import { LeagueTopBar } from "@/components/LeagueTopBar";
import { listBets } from "@/server/bets";
import { gifsEnabled, readMessages } from "@/server/chat";
import { listMembers } from "@/server/leagues";

export const metadata: Metadata = { title: "Chat · JentApp" };

export default async function ChatPage({ params, searchParams }: PageProps<"/l/[ligue]/chat">) {
  const { ligue } = await params;
  const focus = Number((await searchParams).message);
  const { user, membership } = await enterLeague(ligue);
  const now = new Date();
  const [messages, members, bets] = await Promise.all([
    readMessages(user, ligue, now),
    listMembers(user, ligue),
    listBets(user, ligue, now),
  ]);
  const shareable = bets
    .filter((b) => b.state === "open" || b.state === "scheduled")
    .map((b) => ({ id: b.id, label: "question" in b ? b.question : "Pari mystère" }));

  return (
    <div className="flex min-h-0 grow flex-col">
      <header className="flex shrink-0 flex-col gap-1 px-5 py-3">
        <LeagueTopBar userId={user.id} leagueId={ligue} showBalance />
        <div className="flex items-center justify-between">
          <h1 className="text-title">Chat</h1>
          <Presence />
        </div>
      </header>
      <ChatClient
        leagueId={ligue}
        me={{ id: user.id, username: user.username }}
        isManager={membership.role !== "player"}
        initial={messages}
        members={members.map((m) => ({
          id: m.userId,
          username: m.username,
          image: m.image,
          ring: m.ring,
        }))}
        gifsEnabled={gifsEnabled()}
        shareable={shareable}
        focusId={Number.isInteger(focus) && focus > 0 ? focus : undefined}
      />
    </div>
  );
}
