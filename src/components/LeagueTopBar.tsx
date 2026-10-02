import type { ReactNode } from "react";
import { BalancePill } from "@/components/BalancePill";
import { LeagueSheet } from "@/components/LeagueSheet";
import { listMyLeagues } from "@/server/leagues";

/** Haut de chaque onglet : sélecteur de ligue à gauche, action éventuelle à droite. */
export async function LeagueTopBar({
  userId,
  leagueId,
  action,
  showBalance = false,
}: {
  userId: string;
  leagueId: string;
  action?: ReactNode;
  /** Solde de la ligue active, à droite (en-tête de Paris). */
  showBalance?: boolean;
}) {
  const leagues = await listMyLeagues({ id: userId });
  const current = leagues.find((l) => l.id === leagueId);
  const balance =
    showBalance && current ? (
      <BalancePill leagueId={leagueId} leagueName={current.name} balance={current.balance} />
    ) : null;
  return (
    <div className="flex items-center justify-between">
      <LeagueSheet current={leagueId} leagues={leagues} />
      {(balance || action) && (
        <div className="flex items-center gap-2">
          {action}
          {balance}
        </div>
      )}
    </div>
  );
}
