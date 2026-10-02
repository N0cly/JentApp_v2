// Textes des emails : docs/M1.md, § Emails.

export type EmailContent = { subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** HTML minimal, sans mise en page : un paragraphe par bloc, le lien cliquable. */
function toHtml(paragraphs: string[], link: string): string {
  return paragraphs
    .map((p) =>
      p === link
        ? `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`
        : `<p>${escapeHtml(p).replaceAll("\n", "<br>")}</p>`,
    )
    .join("\n");
}

function build(subject: string, paragraphs: string[], link: string): EmailContent {
  return { subject, text: `${paragraphs.join("\n\n")}\n`, html: toHtml(paragraphs, link) };
}

export function confirmationEmail({ pseudo, link }: { pseudo: string; link: string }) {
  return build(
    "Confirme ton email JentApp",
    [
      `Salut ${pseudo},`,
      "Confirme ton email pour sécuriser ton compte JentApp :",
      link,
      "Le lien est valable 24 heures. Si tu n'as pas créé de compte, ignore ce message.",
    ],
    link,
  );
}

export function resetPasswordEmail({ pseudo, link }: { pseudo: string; link: string }) {
  return build(
    "Choisis un nouveau mot de passe JentApp",
    [
      `Salut ${pseudo},`,
      "Choisis un nouveau mot de passe ici :",
      link,
      "Le lien est valable 1 heure et ne sert qu'une fois. Si tu n'as rien demandé, ignore ce message : ton mot de passe ne change pas.",
    ],
    link,
  );
}
