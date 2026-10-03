import type { Metadata } from "next";
import { OnboardingDots } from "@/components/pwa/OnboardingDots";
import { EnablePush } from "@/components/pwa/EnablePush";
import { Screen } from "@/components/Screen";
import { AtIcon, BellIcon, Button, ClockIcon, TicketIcon } from "@/components/ui";
import { requireUser, safeNext } from "@/server/auth";
import { pushEnabled, vapidPublicKey } from "@/server/push";

export const metadata: Metadata = { title: "Activer les notifications · JentApp" };

const moments = [
  { Icon: TicketIcon, text: "Un nouveau pari est ouvert" },
  { Icon: ClockIcon, text: "Un résultat est saisi sur un pari où tu as misé" },
  { Icon: AtIcon, text: "Quelqu'un te mentionne dans le chat" },
];

export default async function EnableNotificationsPage({
  searchParams,
}: PageProps<"/notifications/activer">) {
  const params = await searchParams;
  await requireUser("/notifications/activer");
  // Étape suivante : la suite du parcours, ou l'écran d'où l'on vient.
  const next = safeNext(params.suite) ?? "/";
  const onboarding = params.parcours === "1";

  return (
    <Screen>
      <div className="flex shrink-0 justify-end px-3 pt-3">
        <Button variant="discreet" href={next}>
          Plus tard
        </Button>
      </div>
      <main className="flex grow flex-col gap-4 px-6 pt-2 pb-6">
        <div className="flex size-[88px] shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <BellIcon size={40} />
        </div>
        <h1 className="text-title">Ne rate rien quand ça se joue</h1>
        <p className="text-body text-ink-muted">
          Trois moments où une notification t&apos;évite de rater le coche.
        </p>
        <div className="flex shrink-0 flex-col rounded-md bg-surface px-4 [&>*+*]:border-t [&>*+*]:border-line">
          {moments.map(({ Icon, text }) => (
            <div key={text} className="flex min-h-[56px] items-center gap-3">
              <span className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-surface-raised text-brand">
                <Icon size={18} />
              </span>
              <span className="text-[15px] leading-5">{text}</span>
            </div>
          ))}
        </div>
        <p className="text-caption text-ink-subtle">
          Réglable ligue par ligue, dans Réglages. Sur iPhone, il faut d&apos;abord installer
          l&apos;app.
        </p>
        <div className="grow" />
        {onboarding && <OnboardingDots active={4} />}
        <EnablePush enabled={pushEnabled()} publicKey={vapidPublicKey()} next={next} />
      </main>
    </Screen>
  );
}
