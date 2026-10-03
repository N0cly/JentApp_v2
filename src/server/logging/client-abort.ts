// Un navigateur qui se ferme pendant un rendu serveur (un rafraîchissement en
// direct, par exemple) coupe la réponse : React interrompt le rendu avec
// « The destination stream closed early. ». Next ignore déjà les interruptions
// du client (AbortError), mais ne reconnaît pas ce message-là et l'écrit comme
// une erreur. Ce n'en est pas une : on l'écarte des journaux, lui seul.

export const CLIENT_ABORT_MESSAGES = new Set([
  "The destination stream closed early.",
  "The destination stream errored while writing data.",
]);

/** Vrai si la ligne de journal ne porte qu'une interruption du client. */
export function isClientAbortLog(args: unknown[]): boolean {
  return args.some((arg) => arg instanceof Error && CLIENT_ABORT_MESSAGES.has(arg.message));
}

let installed = false;

/** Filtre console.error une fois, au démarrage du serveur. */
export function installClientAbortFilter() {
  if (installed) return;
  installed = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (isClientAbortLog(args)) return;
    original(...args);
  };
}
