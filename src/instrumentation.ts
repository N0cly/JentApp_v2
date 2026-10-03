// Démarrage du serveur Next.js (une fois par processus).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installClientAbortFilter } = await import("@/server/logging/client-abort");
  installClientAbortFilter();
}
