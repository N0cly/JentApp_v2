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
        : `Confirme ton email : un lien est parti à ${email}`;

  return (
    <form action={action} className="flex items-center gap-3 rounded-md bg-surface px-4 py-2">
      <span className="flex text-brand">
        <MailIcon size={18} />
      </span>
      <span role="status" className="grow text-[13px] leading-[18px] text-ink-muted">
        {text}
      </span>
      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] px-1 text-[13px] font-semibold text-brand disabled:opacity-45"
      >
        Renvoyer
      </button>
    </form>
  );
}
