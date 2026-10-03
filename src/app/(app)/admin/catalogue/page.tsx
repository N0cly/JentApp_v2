import type { Metadata } from "next";
import { CatalogBoard } from "@/components/catalog/CatalogBoard";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { requireSuperAdmin } from "@/server/auth";
import { listCatalog } from "@/server/catalog";

export const metadata: Metadata = { title: "Catalogue · JentApp" };

/** Catalogue du super-admin ; tout autre compte reçoit une 404. */
export default async function CatalogPage() {
  const user = await requireSuperAdmin();
  const catalog = await listCatalog(user);
  return (
    <Screen>
      <ScreenHeader
        back="/compte"
        title="Catalogue"
        action={
          <span className="text-overline mr-2 rounded-sm border border-brand px-2 py-1 text-brand">
            SUPER-ADMIN
          </span>
        }
      />
      <CatalogBoard
        cosmetics={catalog.cosmetics}
        achievements={catalog.achievements}
        me={{ username: user.username, image: user.image }}
      />
    </Screen>
  );
}
