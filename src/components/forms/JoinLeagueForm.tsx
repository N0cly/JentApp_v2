"use client";

import { useActionState, useState, useTransition } from "react";
import {
  joinLeagueAction,
  previewInviteAction,
  type PreviewState,
} from "@/app/(app)/league-actions";
import { FormMessage } from "@/components/FormMessage";
import { InvitePreviewTicket } from "@/components/InviteTicket";
import { Button, FieldError } from "@/components/ui";
import { cx } from "@/lib/cx";
import { useFormErrors, type FormState } from "./use-form-errors";

const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export function JoinLeagueForm({
  initialCode,
  initialPreview,
  invitedBy,
}: {
  initialCode: string;
  initialPreview: PreviewState;
  invitedBy: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(joinLeagueAction, {});
  const { formRef, formError, error, clear } = useFormErrors(state);
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState<PreviewState>(initialPreview);
  const [checking, startChecking] = useTransition();

  function change(value: string) {
    const next = value.replace(/\s+/g, "").toUpperCase().slice(0, 6);
    setCode(next);
    clear("code");
    setPreview({});
    // Aperçu dès que le code a ses six caractères.
    if (CODE.test(next)) {
      startChecking(async () => setPreview(await previewInviteAction(next, invitedBy)));
    }
  }

  const codeError = error("code") ?? preview.error;
  const valid = preview.preview !== undefined;

  return (
    <form ref={formRef} action={action} className="flex grow flex-col gap-5" noValidate>
      {formError && <FormMessage>{formError}</FormMessage>}
      <div className="flex flex-col gap-2">
        <label htmlFor="code" className="text-[12px] leading-4 font-semibold text-ink-muted">
          Code d&apos;invitation
        </label>
        <input
          id="code"
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={6}
          aria-invalid={codeError ? true : undefined}
          aria-describedby={codeError ? "code-error" : undefined}
          value={code}
          onChange={(e) => change(e.target.value)}
          className={cx(
            "h-[64px] rounded-md border-[1.5px] bg-surface px-4 text-center font-mono text-[28px] font-medium tracking-[0.3em] text-ink",
            codeError ? "border-loss" : valid ? "border-brand" : "border-line-strong",
          )}
        />
        {codeError && <FieldError id="code-error">{codeError}</FieldError>}
      </div>
      {preview.preview && (
        <InvitePreviewTicket
          code={code}
          name={preview.preview.name}
          members={preview.preview.members}
          invitedBy={preview.preview.invitedBy}
          joinGrant={preview.preview.joinGrant}
        />
      )}
      <div className="grow" />
      <div className="flex shrink-0 flex-col gap-2">
        <Button type="submit" disabled={pending || checking}>
          {preview.preview ? `Rejoindre ${preview.preview.name}` : "Rejoindre"}
        </Button>
        <Button variant="secondary" href="/ligues/nouvelle" className="bg-bg">
          Créer ma propre ligue
        </Button>
      </div>
    </form>
  );
}
