"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, CheckIcon, PlusIcon, Segmented, ShareIcon } from "@/components/ui";
import { isIos, isStandalone } from "@/lib/device";
import { hasInstallPrompt, promptInstall, subscribeInstallPrompt } from "@/lib/install-prompt";

type Device = "iphone" | "android";

const devices = [
  { value: "iphone", label: "iPhone" },
  { value: "android", label: "Android" },
] as const;

const none = () => () => {};

function Step({
  n,
  icon,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[56px] items-center gap-3">
      <span className="flex size-[28px] shrink-0 items-center justify-center rounded-full bg-surface-raised font-mono text-[15px] font-medium">
        {n}
      </span>
      <span className="grow text-[15px] leading-5">{children}</span>
      <span className="flex text-brand">{icon}</span>
    </div>
  );
}

/** Étapes d'installation (installer-l-app.html) ; sautées si l'app est déjà installée. */
export function InstallGuide({ onboarding, next }: { onboarding: boolean; next: string }) {
  const router = useRouter();
  const detected = useSyncExternalStore(
    none,
    () => (isStandalone() ? "installed" : isIos() ? "iphone" : "android"),
    () => null,
  );
  const prompt = useSyncExternalStore(subscribeInstallPrompt, hasInstallPrompt, () => false);
  const [choice, setChoice] = useState<Device | null>(null);
  const device: Device = choice ?? (detected === "iphone" ? "iphone" : "android");

  // Déjà installée : l'étape est sautée dans le parcours.
  useEffect(() => {
    if (onboarding && detected === "installed") router.replace(next);
  }, [onboarding, detected, next, router]);

  if (detected === "installed") {
    return <p className="text-body text-ink-muted">JentApp est déjà installée.</p>;
  }

  return (
    <>
      <Segmented
        label="Appareil"
        options={devices}
        value={device}
        onChange={setChoice}
        className="shrink-0"
      />
      {device === "iphone" ? (
        <>
          <div className="flex shrink-0 flex-col rounded-md bg-surface px-4 [&>*+*]:border-t [&>*+*]:border-line">
            <Step n={1} icon={<ShareIcon size={20} />}>
              Dans Safari, touche <span className="font-bold">Partager</span>
            </Step>
            <Step n={2} icon={<PlusIcon size={20} />}>
              Choisis <span className="font-bold">Sur l&apos;écran d&apos;accueil</span>
            </Step>
            <Step n={3} icon={<CheckIcon size={20} />}>
              Ouvre JentApp depuis ton écran d&apos;accueil
            </Step>
          </div>
          <p className="text-caption text-ink-subtle">
            Sur Android, un bouton « Installer » remplace ces étapes.
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            disabled={!prompt}
            onClick={async () => {
              if (await promptInstall()) router.replace(next);
            }}
          >
            Installer
          </Button>
          {!prompt && (
            <p className="text-caption text-ink-subtle">
              Ton navigateur ne propose pas l&apos;installation. Ouvre JentApp dans Chrome.
            </p>
          )}
        </div>
      )}
    </>
  );
}
