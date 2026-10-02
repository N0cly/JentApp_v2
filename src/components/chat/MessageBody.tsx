import { Fragment } from "react";

const MENTION = /(@[\p{L}\p{M}\p{N}_-]{3,20})/gu;

/** Texte tel quel (pas de HTML, pas de lien), sauts de ligne gardés, mentions en brand. */
export function MessageBody({ body, mentions }: { body: string; mentions: string[] }) {
  const known = new Set(mentions.map((m) => m.toLowerCase()));
  const parts = body.split(MENTION);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        part.startsWith("@") && known.has(part.slice(1).toLowerCase()) ? (
          <span key={i} className="font-semibold text-brand">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  );
}
