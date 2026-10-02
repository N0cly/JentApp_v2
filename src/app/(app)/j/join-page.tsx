import { JoinLeagueForm } from "@/components/forms/JoinLeagueForm";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { requireUser } from "@/server/auth";
import { normalizeCode, previewInvite } from "@/server/leagues";

/** /j et /j/{code} : le lien d'invitation pré-remplit le code. */
export async function JoinPage({ code, invitedBy }: { code?: string; invitedBy: string | null }) {
  const back = code
    ? `/j/${code}${invitedBy ? `?par=${encodeURIComponent(invitedBy)}` : ""}`
    : "/j";
  const user = await requireUser(back);
  const normalized = code ? (normalizeCode(code) ?? code.toUpperCase().slice(0, 6)) : "";
  let initialPreview = {};
  if (code) {
    const result = await previewInvite(user, normalized, invitedBy);
    initialPreview = result.ok
      ? { preview: result.preview }
      : { error: result.fieldErrors?.code ?? result.formError };
  }

  return (
    <Screen>
      <ScreenHeader back="/" title="Rejoindre une ligue" />
      <main className="flex grow flex-col gap-5 px-5 pt-2 pb-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-8 font-extrabold tracking-[-0.02em] [font-stretch:85%]">
            Entre le code de la bande
          </h1>
          <p className="text-body text-ink-muted">
            Six caractères, donnés par un membre. Avec un lien d&apos;invitation, le code se remplit
            tout seul.
          </p>
        </div>
        <JoinLeagueForm
          initialCode={normalized}
          initialPreview={initialPreview}
          invitedBy={invitedBy}
        />
      </main>
    </Screen>
  );
}
