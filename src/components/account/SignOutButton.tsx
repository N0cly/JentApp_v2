"use client";

import { useRef } from "react";
import { signOutAction } from "@/app/(compte)/actions";
import { Button, SignOutIcon } from "@/components/ui";

/** Endpoint de l'abonnement push de cet appareil, désabonné au passage. */
async function dropDeviceSubscription(): Promise<string> {
  if (!("serviceWorker" in navigator)) return "";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return "";
  await subscription.unsubscribe();
  return subscription.endpoint;
}

/** « Se déconnecter » : retire aussi l'abonnement push de cet appareil. */
export function SignOutButton() {
  const prepared = useRef(false);
  const endpoint = useRef<HTMLInputElement>(null);
  return (
    <form
      action={signOutAction}
      onSubmit={async (event) => {
        if (prepared.current) return;
        event.preventDefault();
        const form = event.currentTarget;
        const value = await dropDeviceSubscription().catch(() => "");
        if (endpoint.current) endpoint.current.value = value;
        prepared.current = true;
        form.requestSubmit();
      }}
    >
      <input ref={endpoint} type="hidden" name="endpoint" defaultValue="" />
      <Button variant="secondary" type="submit">
        <SignOutIcon size={18} />
        Se déconnecter
      </Button>
    </form>
  );
}
