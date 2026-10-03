"use client";

import { useEffect } from "react";
import { captureInstallPrompt } from "@/lib/install-prompt";

/**
 * Enregistre public/sw.js, dans le build de production seulement, et garde la
 * proposition d'installation du navigateur.
 */
export function ServiceWorker() {
  useEffect(() => {
    captureInstallPrompt();
  }, []);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const version = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(version)}`, { scope: "/" })
      .catch(() => {
        // Sans service worker, l'app marche ; seuls le push et le hors-ligne manquent.
      });
  }, []);
  return null;
}
