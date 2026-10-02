import type { Metadata } from "next";
import { CreateLeagueForm } from "@/components/forms/CreateLeagueForm";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Créer une ligue · JentApp" };

export default async function NewLeaguePage() {
  await requireUser("/ligues/nouvelle");
  return (
    <Screen>
      <ScreenHeader back="/" title="Créer une ligue" />
      <main className="flex grow flex-col gap-4 px-5 pt-2 pb-6">
        <CreateLeagueForm />
      </main>
    </Screen>
  );
}
