import type { Metadata } from "next";
import { StickerProbe } from "./probe";

// Page provisoire de diagnostic : à retirer avant la prochaine fusion dans main.
export const metadata: Metadata = { title: "Stickers · Kit · JentApp" };

export default function KitStickersPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col">
      <main className="flex grow flex-col gap-6 px-5 pt-3 pb-8">
        <header className="flex flex-col gap-1">
          <p className="text-overline text-ink-subtle">JentApp · Kit</p>
          <h1 className="text-title">Stickers</h1>
          <p className="text-body text-ink-muted">
            Colle ou insère un sticker dans chaque champ. Les événements s&apos;affichent ici ; rien
            n&apos;est envoyé au serveur.
          </p>
        </header>
        <StickerProbe />
      </main>
    </div>
  );
}
