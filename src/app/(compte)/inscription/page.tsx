import type { Metadata } from "next";
import { SignUpForm } from "@/components/forms/SignUpForm";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { safeNext } from "@/server/auth";
import { redirectIfSignedIn } from "../redirect-if-signed-in";

export const metadata: Metadata = { title: "Créer un compte · JentApp" };

export default async function SignUpPage({ searchParams }: PageProps<"/inscription">) {
  const next = safeNext((await searchParams).next);
  await redirectIfSignedIn(next);

  return (
    <Screen>
      <ScreenHeader
        back={next ? `/connexion?next=${encodeURIComponent(next)}` : "/connexion"}
        title="Créer un compte"
      />
      <main className="flex grow flex-col gap-4 px-5 pt-2 pb-6">
        <h1 className="text-[28px] leading-8 font-extrabold tracking-[-0.02em] [font-stretch:85%]">
          Rejoins le comptoir
        </h1>
        <SignUpForm next={next} />
      </main>
    </Screen>
  );
}
