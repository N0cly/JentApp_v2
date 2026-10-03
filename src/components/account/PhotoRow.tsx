"use client";

import { useActionState, useRef, useState } from "react";
import { uploadPhotoAction, type PhotoState } from "@/app/(app)/compte/photo-action";
import { Avatar, FieldError } from "@/components/ui";

const MAX_BYTES = 5 * 1024 * 1024;

/** « Photo de profil · Changer » : choisir un fichier l'envoie aussitôt. */
export function PhotoRow({ username, image }: { username: string; image: string | null }) {
  const [state, action, pending] = useActionState<PhotoState, FormData>(uploadPhotoAction, {});
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const error = localError ?? state.error;

  return (
    <div>
      <form ref={formRef} action={action}>
        <input
          ref={inputRef}
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-describedby={error ? "photo-error" : undefined}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            // Contrôle avant l'envoi : le serveur refuse aussi au-delà.
            if (file.size > MAX_BYTES) {
              setLocalError("Photo trop lourde : 5 Mo au plus.");
              e.target.value = "";
              return;
            }
            setLocalError(null);
            formRef.current?.requestSubmit();
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="flex min-h-[52px] w-full items-center justify-between gap-3 py-1 text-left"
        >
          <span className="flex items-center gap-3">
            <Avatar name={username} src={image} size={36} background="surface-raised" />
            <span className="text-[15px] leading-5 font-semibold">Photo de profil</span>
          </span>
          <span className="text-[14px] font-semibold text-brand">Changer</span>
        </button>
      </form>
      {error && (
        <div className="pb-3">
          <FieldError id="photo-error">{error}</FieldError>
        </div>
      )}
    </div>
  );
}
