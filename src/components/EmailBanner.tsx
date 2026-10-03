"use client";

import { useActionState } from "react";
import { resendVerificationAction, type ResendState } from "@/app/(compte)/actions";
import { MailIcon } from "@/components/ui";

/** Rappel « Confirme ton email », tant que l'email n'est pas confirmé. */
export function EmailBanner({ email, expired = false }: { email: string; expired?: boolean }) {
  const [state, action, pending] = useActionState<ResendState>(resendVerificationAction, {});

  const text = state.error
    ? state.error
    : state.sent
      ? `Un nouveau lien est parti à ${email}`
      : expired
        ? "Ce lien n'est plus valable. Demande-en un nouveau."
        : `Confirme ton email : un lien est parti à ${email}`;

  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-x-3 rounded-md bg-surface px-4 py-2"
    >
      <span className="flex shrink-0 text-brand">
        <MailIcon size={18} />
      </span>
      {/* Avec un texte agrandi, « Renvoyer » passe sous la phrase. */}
      <span
        role="status"
        className="min-w-0 flex-1 basis-[200px] text-[13px] leading-[18px] text-ink-muted [overflow-wrap:anywhere]"
      >
        {text}
      </span>
      <button
        type="submit"
        disabled={pending}
        className="ml-auto min-h-[44px] px-1 text-[13px] font-semibold text-brand disabled:opacity-45"
      >
        Renvoyer
      </button>
    </form>
  );
}
