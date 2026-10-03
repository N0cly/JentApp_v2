// Suivi d'erreurs (docs/PROD.md, A.3) : ce qui part vers GlitchTip, côté
// serveur comme côté navigateur. Aucune donnée personnelle : ni email, ni
// cookie, ni corps de requête ; du joueur, son seul identifiant.

import type { BrowserOptions, ErrorEvent } from "@sentry/nextjs";

/** Interruptions du client, déjà écartées des journaux (M7) : elles ne remontent pas. */
export const CLIENT_ABORT_MESSAGES = [
  "The destination stream closed early.",
  "The destination stream errored while writing data.",
];

const EMAIL = /[^\s@<>"'()]+@[^\s@<>"'()]+\.[^\s@<>"'()]+/g;
/** Drizzle recopie les paramètres d'une requête en échec : jetons, emails… */
const QUERY_PARAMS = /\n?\s*params: .*/g;

/** Retire d'un texte les emails et les paramètres de requête SQL. */
export function scrubText(text: string): string;
export function scrubText(text: string | undefined): string | undefined;
export function scrubText(text: string | undefined) {
  return text?.replace(QUERY_PARAMS, "").replace(EMAIL, "[email]");
}

/** Options communes : erreurs seulement, sans traces de performance ni données collectées. */
export const reportOptions: Pick<BrowserOptions, "ignoreErrors" | "dataCollection"> = {
  ignoreErrors: CLIENT_ABORT_MESSAGES,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
  },
};

/** Nettoie un événement avant l'envoi. Pur. */
export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  const messages = [event.message, ...(event.exception?.values?.map((v) => v.value) ?? [])];
  if (messages.some((m) => m && CLIENT_ABORT_MESSAGES.includes(m))) return null;

  if (event.request) {
    const url = event.request.url?.split("?")[0];
    event.request = { url, method: event.request.method };
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  // Les fils d'Ariane reprennent la console et les URL appelées : on ne les garde pas.
  delete event.breadcrumbs;
  delete event.extra;
  event.message = scrubText(event.message);
  for (const value of event.exception?.values ?? []) {
    value.value = scrubText(value.value);
    // Variables locales et lignes de code autour de l'erreur : jamais envoyées.
    for (const frame of value.stacktrace?.frames ?? []) {
      delete frame.vars;
      delete frame.pre_context;
      delete frame.context_line;
      delete frame.post_context;
    }
  }
  return event;
}
