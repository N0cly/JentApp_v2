import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BetIllustration,
  LeaguesIllustration,
  PotIllustration,
} from "@/components/presentation/Illustrations";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/ui";
import { cx } from "@/lib/cx";
import { requireUser, safeNext } from "@/server/auth";

export const metadata: Metadata = { title: "Présentation · JentApp" };

const steps = [
  {
    title: "Mise tes clopes sur la soirée",
    text: "Quelqu'un lance une question, tu choisis une option, tu mises. Les clopes sont fictives : rien à acheter, rien à retirer.",
    Illustration: BetIllustration,
  },
  {
    title: "Les gagnants se partagent le pot",
    text: "Pas de cote fixée à l'avance : toutes les mises vont dans un pot, partagé au prorata entre ceux qui ont vu juste.",
    Illustration: PotIllustration,
  },
  {
    title: "Une ligue par bande",
    text: "Chaque ligue a son chat, son classement et son solde. Tes clopes ne passent pas d'une ligue à l'autre.",
    Illustration: LeaguesIllustration,
  },
];

export default async function PresentationPage({
  searchParams,
}: PageProps<"/bienvenue/presentation">) {
  const params = await searchParams;
  await requireUser("/bienvenue/presentation");
  const index = Number(params.etape ?? "1") - 1;
  const step = steps[index];
  if (!step) notFound();

  // Après la présentation : installer l'app, les notifications, puis
  // l'invitation si on venait d'un lien, sinon l'accueil.
  // « Revoir la présentation » (Aide) ramène simplement d'où l'on vient.
  const suite = safeNext(params.suite) ?? "/";
  const onboarding = params.parcours === "1";
  const after = onboarding ? `/installer?parcours=1&suite=${encodeURIComponent(suite)}` : suite;
  const isLast = index === steps.length - 1;
  const query = new URLSearchParams({
    etape: String(index + 2),
    ...(params.suite ? { suite } : {}),
    ...(onboarding ? { parcours: "1" } : {}),
  });
  const nextHref = isLast ? after : `/bienvenue/presentation?${query}`;

  return (
    <Screen>
      <div className="flex shrink-0 justify-end px-3 pt-3">
        <Button variant="discreet" href={after}>
          Passer
        </Button>
      </div>
      <main className="flex grow flex-col gap-4 px-6 pt-2 pb-6">
        <div
          aria-hidden="true"
          className="pointer-events-none flex h-[340px] shrink-0 flex-col justify-center"
        >
          <step.Illustration />
        </div>
        <h1 className="text-title">{step.title}</h1>
        <p className="text-body text-ink-muted">{step.text}</p>
        <div className="grow" />
        <div aria-hidden="true" className="flex justify-center gap-2">
          {steps.map((s, i) => (
            <span
              key={s.title}
              className={cx(
                "h-[6px] rounded-full",
                i === index ? "w-[20px] bg-brand" : "w-[6px] bg-line-strong",
              )}
            />
          ))}
        </div>
        <Button href={nextHref}>Suivant</Button>
      </main>
    </Screen>
  );
}
