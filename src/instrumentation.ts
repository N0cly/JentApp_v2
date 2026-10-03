// Démarrage du serveur Next.js (une fois par processus).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installClientAbortFilter } = await import("@/server/logging/client-abort");
  installClientAbortFilter();
  // Le push part des signaux validés : l'écoute démarre avec le serveur.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startPush } = await import("@/server/push");
  await startPush().catch((error) => console.warn("Push non démarré", error));
}
