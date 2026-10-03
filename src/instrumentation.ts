import * as Sentry from "@sentry/nextjs";

// Démarrage du serveur Next.js (une fois par processus).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installClientAbortFilter } = await import("@/server/logging/client-abort");
  installClientAbortFilter();
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // Suivi d'erreurs : ERROR_DSN lu à l'exécution ; vide, désactivé.
  const { startServerMonitoring } = await import("@/server/monitoring");
  startServerMonitoring();
  // Le push part des signaux validés : l'écoute démarre avec le serveur.
  const { startPush } = await import("@/server/push");
  await startPush().catch((error) => console.warn("Push non démarré", error));
}

/** Erreurs de rendu, de route et d'action, transmises au suivi s'il est démarré. */
export const onRequestError = Sentry.captureRequestError;
