"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { pushStatusAction, unsubscribePushAction } from "@/app/(app)/notifications/push-actions";
import { Switch } from "@/components/Switch";
import { supportsPush } from "@/lib/device";

/** Ligne « Notifications push », pour cet appareil ; masquée sans push. */
export function PushSwitch({ enabled, returnTo }: { enabled: boolean; returnTo: string }) {
  const router = useRouter();
  const [state, setState] = useState<"hidden" | "on" | "off" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!enabled || !supportsPush()) return setState("hidden");
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      const on = subscription ? await pushStatusAction(subscription.endpoint) : false;
      if (!cancelled) setState(on && Notification.permission === "granted" ? "on" : "off");
    })().catch(() => setState("hidden"));
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (state === null || state === "hidden") return null;

  const change = async (on: boolean) => {
    if (on) {
      router.push(`/notifications/activer?suite=${encodeURIComponent(returnTo)}`);
      return;
    }
    setState("off");
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await unsubscribePushAction(subscription.endpoint);
      await subscription.unsubscribe();
    }
  };

  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 py-1">
      <span className="text-[15px] leading-5 font-semibold">Notifications push</span>
      <Switch label="Notifications push" on={state === "on"} onChange={change} />
    </div>
  );
}
