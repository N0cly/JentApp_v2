// Clés VAPID (docs/M7.md, § Push). Sans clés : push désactivé, le centre marche.

export function vapidKeys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function pushEnabled(): boolean {
  return vapidKeys() !== null;
}

/** Clé publique, que le navigateur reçoit pour s'abonner. */
export function vapidPublicKey(): string | null {
  return vapidKeys()?.publicKey ?? null;
}
