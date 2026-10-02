import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/forms/ForgotPasswordForm";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";

export const metadata: Metadata = { title: "Mot de passe oublié · JentApp" };

export default function ForgotPasswordPage() {
  return (
    <Screen>
      <ScreenHeader back="/connexion" title="Mot de passe oublié" />
      <main className="flex grow flex-col gap-4 px-5 pt-2 pb-6">
        <h1 className="text-[28px] leading-8 font-extrabold tracking-[-0.02em] [font-stretch:85%]">
          On t&apos;envoie un lien
        </h1>
        <p className="text-body text-ink-muted">
          Entre l&apos;email de ton compte. Tu recevras un lien pour choisir un nouveau mot de
          passe.
        </p>
        <ForgotPasswordForm />
      </main>
    </Screen>
  );
}
