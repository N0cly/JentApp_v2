/** En-têtes d'une requête de test, avec les cookies d'une réponse précédente. */
export function requestHeaders(cookies?: Headers, extra: Record<string, string> = {}): Headers {
  const headers = new Headers(extra);
  if (cookies) {
    const jar = cookies
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    if (jar) headers.set("cookie", jar);
  }
  return headers;
}

/** Lien contenu dans le texte d'un email. */
export function linkIn(text: string): string {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) throw new Error("Aucun lien dans l'email");
  return match[0];
}
