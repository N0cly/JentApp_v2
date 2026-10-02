import type { ReactNode } from "react";
import { LeagueSheet } from "@/components/LeagueSheet";
import { listMyLeagues } from "@/server/leagues";

/** Haut de chaque onglet : sélecteur de ligue à gauche, action éventuelle à droite. */
export async function LeagueTopBar({
  userId,
  leagueId,
  action,
}: {
  userId: string;
  leagueId: string;
  action?: ReactNode;
}) {
  const leagues = await listMyLeagues({ id: userId });
  return (
    <div className="flex items-center justify-between">
      <LeagueSheet current={leagueId} leagues={leagues} />
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
