import type { Metadata } from "next";
import { AppIcon } from "@/components/AppIcon";
import { InstallGuide } from "@/components/pwa/InstallGuide";
import { OnboardingDots } from "@/components/pwa/OnboardingDots";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/ui";
import { requireUser, safeNext } from "@/server/auth";

export const metadata: Metadata = { title: "Installer l'app · JentApp" };

export default async function InstallPage({ searchParams }: PageProps<"/installer">) {
  const params = await searchParams;
  await requireUser("/installer");
  const suite = safeNext(params.suite) ?? "/";
  const onboarding = params.parcours === "1";
  // Dans le parcours, l'étape suivante est l'activation des notifications.
  const next = onboarding
    ? `/notifications/activer?parcours=1&suite=${encodeURIComponent(suite)}`
    : suite;

  return (
    <Screen>
      <div className="flex shrink-0 justify-end px-3 pt-3">
        <Button variant="discreet" href={next}>
          Plus tard
        </Button>
      </div>
      <main className="flex grow flex-col gap-4 px-6 pt-2 pb-6">
        <AppIcon size={88} />
        <h1 className="text-title">Installe JentApp</h1>
        <p className="text-body text-ink-muted">
          Sur ton écran d&apos;accueil, l&apos;app s&apos;ouvre en plein écran et peut
          t&apos;envoyer des notifications.
        </p>
        <InstallGuide onboarding={onboarding} next={next} />
        <div className="grow" />
        {onboarding && <OnboardingDots active={3} />}
        <Button href={next}>C&apos;est fait</Button>
      </main>
    </Screen>
  );
}
