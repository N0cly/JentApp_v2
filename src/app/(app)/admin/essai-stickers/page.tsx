import type { Metadata } from "next";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { requireSuperAdmin } from "@/server/auth";
import { StickerProbe } from "./StickerProbe";

export const metadata: Metadata = { title: "Essai stickers · JentApp" };

/**
 * Page provisoire, à supprimer : observe ce que le clavier et le presse-papiers
 * insèrent (stickers, images). Super-admin seulement ; tout autre compte : 404.
 */
export default async function StickerProbePage() {
  await requireSuperAdmin();
  return (
    <Screen>
      <ScreenHeader
        back="/compte"
        title="Essai stickers"
        action={
          <span className="text-overline mr-2 rounded-sm border border-brand px-2 py-1 text-brand">
            SUPER-ADMIN
          </span>
        }
      />
      <StickerProbe />
    </Screen>
  );
}
