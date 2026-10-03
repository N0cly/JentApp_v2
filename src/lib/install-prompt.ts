// Proposition d'installation du navigateur (Chrome, Android). L'événement
// arrive une fois, tôt : on le garde pour le bouton « Installer ».

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let saved: InstallPrompt | null = null;
const listeners = new Set<() => void>();

export function captureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    saved = event as InstallPrompt;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    saved = null;
    listeners.forEach((l) => l());
  });
}

export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hasInstallPrompt(): boolean {
  return saved !== null;
}

/** Ouvre la proposition ; vrai si l'installation est acceptée. */
export async function promptInstall(): Promise<boolean> {
  const event = saved;
  if (!event) return false;
  saved = null;
  listeners.forEach((l) => l());
  await event.prompt();
  return (await event.userChoice).outcome === "accepted";
}
