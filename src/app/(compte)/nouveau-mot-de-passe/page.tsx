import type { Metadata } from "next";
import { NewPasswordForm } from "@/components/forms/NewPasswordForm";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { messages } from "@/server/auth";

export const metadata: Metadata = { title: "Nouveau mot de passe · JentApp" };

export default async function NewPasswordPage({
  searchParams,
}: PageProps<"/nouveau-mot-de-passe">) {
  const { token, error } = await searchParams;
  // Lien expiré ou déjà utilisé : Better Auth renvoie ici avec ?error=.
  const valid = typeof token === "string" && token.length > 0 && !error;

  return (
    <Screen>
      <ScreenHeader back="/mot-de-passe-oublie" title="Nouveau mot de passe" />
      <main className="flex grow flex-col gap-4 px-5 pt-2 pb-6">
        <h1 className="text-[28px] leading-8 font-extrabold tracking-[-0.02em] [font-stretch:85%]">
          Choisis un nouveau mot de passe
        </h1>
        <NewPasswordForm token={valid ? token : ""} expired={valid ? null : messages.linkExpired} />
      </main>
    </Screen>
  );
}
