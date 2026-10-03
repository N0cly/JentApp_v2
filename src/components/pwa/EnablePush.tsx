"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { subscribePushAction } from "@/app/(app)/notifications/push-actions";
import { FormMessage } from "@/components/FormMessage";
import { Button } from "@/components/ui";
import { isIos, isStandalone, supportsPush, vapidKeyBytes } from "@/lib/device";

type Situation = "ready" | "ios-not-installed" | "unsupported" | "denied";

const subscribe = () => () => {};

function situation(enabled: boolean): Situation {
  if (isIos() && !isStandalone()) return "ios-not-installed";
  if (!enabled || !supportsPush()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ready";
}

/** Abonne cet appareil au push, avec l'appareil qui le demande. */
export async function subscribeThisDevice(publicKey: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKeyBytes(publicKey),
    }));
  await subscribePushAction(subscription.toJSON() as Parameters<typeof subscribePushAction>[0]);
}

/**
 * Bouton « Activer les notifications » (activer-les-notifications.html) et
 * ses variantes. La permission n'est demandée qu'à l'appui.
 */
export function EnablePush({
  enabled,
  publicKey,
  next,
}: {
  /** Push configuré côté serveur (clés VAPID). */
  enabled: boolean;
  publicKey: string | null;
  /** Étape suivante. */
  next: string;
}) {
  const router = useRouter();
  const initial = useSyncExternalStore(
    subscribe,
    () => situation(enabled),
    () => null,
  );
  const [denied, setDenied] = useState(false);
  const [pending, setPending] = useState(false);
  const shown: Situation | null = denied ? "denied" : initial;

  // Navigateur sans push : l'étape est sautée.
  useEffect(() => {
    if (shown === "unsupported") router.replace(next);
  }, [shown, next, router]);

  const activate = async () => {
    if (!publicKey) return;
    setPending(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDenied(true);
        return;
      }
      await subscribeThisDevice(publicKey);
      router.push(next);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {shown === "denied" && (
        <FormMessage>
          Les notifications sont bloquées. Autorise-les dans les réglages de ton navigateur.
        </FormMessage>
      )}
      {shown === "ios-not-installed" && (
        <p className="text-caption text-center text-ink-muted">
          Sur iPhone, installe d&apos;abord l&apos;app.{" "}
          <a href="/installer" className="font-semibold text-brand">
            Installer l&apos;app
          </a>
        </p>
      )}
      <Button onClick={activate} disabled={shown !== "ready" || pending}>
        Activer les notifications
      </Button>
    </div>
  );
}
