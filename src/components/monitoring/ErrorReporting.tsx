"use client";

import { useEffect } from "react";
import { reportOptions, scrubEvent } from "@/lib/error-report";

let started = false;

/**
 * Suivi d'erreurs du navigateur. Le DSN vient du serveur, lu à l'exécution
 * par le layout ; vide, le SDK n'est même pas chargé.
 */
export function ErrorReporting({ dsn }: { dsn: string | null }) {
  useEffect(() => {
    if (!dsn || started) return;
    started = true;
    void import("@sentry/nextjs").then((Sentry) =>
      Sentry.init({
        dsn,
        ...reportOptions,
        release: process.env.NEXT_PUBLIC_BUILD_ID,
        beforeSend: scrubEvent,
      }),
    );
  }, [dsn]);
  return null;
}
