import { Screen } from "@/components/Screen";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <Screen>
      <main className="flex grow flex-col justify-center gap-4 px-6 pb-6">
        <h1 className="text-title">Rien ici</h1>
        <p className="text-body text-ink-muted">
          Cette page n&apos;existe pas, ou tu n&apos;y as pas accès. Reviens à l&apos;accueil.
        </p>
        <Button href="/">Revenir à l&apos;accueil</Button>
      </main>
    </Screen>
  );
}
