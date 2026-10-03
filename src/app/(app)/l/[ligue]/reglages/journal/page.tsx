import type { Metadata } from "next";
import { enterLeague } from "@/app/(app)/l/[ligue]/enter-league";
import { JournalList } from "@/components/journal/JournalList";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { readJournal } from "@/server/journal";
import { getLeague } from "@/server/leagues";

export const metadata: Metadata = { title: "Journal · JentApp" };

/** Journal de la ligue : lisible par tous les membres actifs. */
export default async function JournalPage({ params }: PageProps<"/l/[ligue]/reglages/journal">) {
  const { ligue } = await params;
  const { user } = await enterLeague(ligue);
  const [league, journal] = await Promise.all([
    getLeague(user, ligue),
    readJournal(user, ligue, 0, new Date()),
  ]);
  return (
    <Screen>
      <ScreenHeader back={`/l/${ligue}/reglages`} title={`Journal de ${league.name}`} />
      <main className="flex grow flex-col gap-4 px-5 pt-2 pb-6">
        <p className="text-caption text-ink-muted">Visible par tous les membres de la ligue.</p>
        <JournalList leagueId={ligue} initial={journal.items} initialHasMore={journal.hasMore} />
      </main>
    </Screen>
  );
}
