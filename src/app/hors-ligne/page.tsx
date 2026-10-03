import type { Metadata } from "next";
import { AppIcon } from "@/components/AppIcon";
import { RetryButton } from "@/components/pwa/RetryButton";
import { Screen } from "@/components/Screen";

export const metadata: Metadata = { title: "Hors ligne · JentApp" };
// Gardée en cache par le service worker : aucune donnée d'un joueur.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <Screen>
      <main className="flex grow flex-col items-center justify-center gap-6 px-5 pb-8">
        <AppIcon size={64} />
        <p className="text-body text-center text-ink-muted">
          Pas de réseau. JentApp revient dès que tu es connecté.
        </p>
        <div className="w-full">
          <RetryButton />
        </div>
      </main>
    </Screen>
  );
}
