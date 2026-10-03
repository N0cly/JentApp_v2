// Suivi d'erreurs côté serveur (docs/PROD.md, A.3). ERROR_DSN se lit au
// démarrage du serveur, jamais au build ; vide, rien n'est envoyé.

import * as Sentry from "@sentry/nextjs";
import { reportOptions, scrubEvent } from "@/lib/error-report";

let started = false;

/** Démarre le suivi si ERROR_DSN est défini. Une fois par processus. */
export function startServerMonitoring(): boolean {
  const dsn = process.env.ERROR_DSN?.trim();
  if (!dsn || started) return started;
  Sentry.init({
    dsn,
    ...reportOptions,
    release: process.env.NEXT_PUBLIC_BUILD_ID,
    beforeSend: scrubEvent,
  });
  started = true;
  return true;
}

/** Rattache les erreurs de la requête au joueur, par son seul identifiant. */
export function identifyPlayer(userId: string) {
  if (started) Sentry.setUser({ id: userId });
}
