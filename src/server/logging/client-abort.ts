// Un navigateur qui se ferme pendant un rendu serveur (un rafraîchissement en
// direct, par exemple) coupe la réponse : React interrompt le rendu avec
// « The destination stream closed early. ». Next ignore déjà les interruptions
// du client (AbortError), mais ne reconnaît pas ce message-là et l'écrit comme
// une erreur. Ce n'en est pas une : on l'écarte des journaux, lui seul.

import { CLIENT_ABORT_MESSAGES } from "@/lib/error-report";
import { alreadyWritten, writeErrorLine } from "./error-log";

const ABORTS = new Set(CLIENT_ABORT_MESSAGES);

/** Vrai si la ligne de journal ne porte qu'une interruption du client. */
export function isClientAbortLog(args: unknown[]): boolean {
  return args.some((arg) => arg instanceof Error && ABORTS.has(arg.message));
}

let installed = false;

/** Filtre console.error une fois, au démarrage du serveur. */
export function installClientAbortFilter() {
  if (installed) return;
  installed = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (isClientAbortLog(args)) return;
    // Une erreur s'écrit sur une ligne JSON ; déjà écrite avec sa route, elle n'est pas répétée.
    const error = args.find((arg) => arg instanceof Error);
    if (error) {
      // Une erreur de rendu porte un digest : `onRequestError` l'écrit avec sa route.
      const digest = (error as Error & { digest?: string }).digest;
      if (!digest && !alreadyWritten(error)) {
        writeErrorLine(error, { route: null, method: null, userId: null, now: new Date() });
      }
      return;
    }
    original(...args);
  };
}
