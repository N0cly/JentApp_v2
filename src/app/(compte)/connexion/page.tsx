import type { Metadata } from "next";
import { AppIcon } from "@/components/AppIcon";
import { SignInForm } from "@/components/forms/SignInForm";
import { Screen } from "@/components/Screen";
import { safeNext } from "@/server/auth";
import { redirectIfSignedIn } from "../redirect-if-signed-in";

export const metadata: Metadata = { title: "Connexion · JentApp" };

export default async function SignInPage({ searchParams }: PageProps<"/connexion">) {
  const next = safeNext((await searchParams).next);
  await redirectIfSignedIn(next);

  return (
    <Screen>
      <main className="flex grow flex-col gap-4 px-6 pt-[calc(var(--space-8)*2)] pb-6">
        <div className="mb-6 flex flex-col gap-3">
          <AppIcon />
          <h1 className="text-[56px] leading-[52px] font-extrabold tracking-[-0.03em] [font-stretch:85%]">
            JentApp
          </h1>
          <p className="text-body text-ink-muted">Les paris de la bande, au comptoir de nuit.</p>
        </div>
        <SignInForm next={next} />
      </main>
    </Screen>
  );
}
