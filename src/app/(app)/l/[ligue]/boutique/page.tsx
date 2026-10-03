import type { Metadata } from "next";
import { enterLeague } from "@/app/(app)/l/[ligue]/enter-league";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ShopBoard } from "@/components/shop/ShopBoard";
import { ClopeIcon } from "@/components/ui";
import { getLeague } from "@/server/leagues";
import { appearanceOf, shopView } from "@/server/shop";

export const metadata: Metadata = { title: "Boutique · JentApp" };

export default async function ShopPage({ params }: PageProps<"/l/[ligue]/boutique">) {
  const { ligue } = await params;
  const { user } = await enterLeague(ligue);
  const [league, shop, look] = await Promise.all([
    getLeague(user, ligue),
    shopView(user, ligue),
    appearanceOf(ligue, user.id),
  ]);
  return (
    <Screen>
      <ScreenHeader
        back={`/l/${ligue}/moi`}
        title="Boutique"
        action={
          <span
            aria-label={`Solde : ${shop.balance} ${shop.balance > 1 ? "clopes" : "clope"}`}
            className="mr-2 flex min-h-[44px] items-center gap-1 rounded-full border border-line-strong bg-surface px-4 font-mono text-[15px] font-medium"
          >
            {shop.balance}
            <span className="flex text-brand">
              <ClopeIcon size={18} />
            </span>
          </span>
        }
      />
      <ShopBoard
        leagueId={ligue}
        leagueName={league.name}
        items={shop.items}
        me={{ username: user.username, image: look.image }}
      />
    </Screen>
  );
}
