import { LiveProvider } from "@/components/live/LiveProvider";
import { LiveRefresh } from "@/components/live/LiveRefresh";
import { requireMember } from "@/server/auth";

/** Toutes les pages d'une ligue partagent son flux temps réel. */
export default async function LeagueLayout({ children, params }: LayoutProps<"/l/[ligue]">) {
  const { ligue } = await params;
  await requireMember(ligue);
  return (
    <LiveProvider leagueId={ligue}>
      <LiveRefresh />
      {children}
    </LiveProvider>
  );
}
