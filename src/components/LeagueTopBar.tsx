import type { ReactNode } from "react";
import { BalancePill } from "@/components/BalancePill";
import { LeagueSheet } from "@/components/LeagueSheet";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { listMyLeagues } from "@/server/leagues";
import { hasUnread } from "@/server/notifications";

/** Haut de chaque onglet : sélecteur de ligue à gauche, action éventuelle à droite. */
export async function LeagueTopBar({
  userId,
  leagueId,
  action,
  showBalance = false,
  showBell = false,
}: {
  userId: string;
  leagueId: string;
  action?: ReactNode;
  /** Solde de la ligue active, à droite (en-tête de Paris). */
  showBalance?: boolean;
  /** Cloche des notifications, à droite du solde (M7). */
  showBell?: boolean;
}) {
  const [leagues, unread] = await Promise.all([
    listMyLeagues({ id: userId }),
    showBell ? hasUnread({ id: userId }) : false,
  ]);
  const current = leagues.find((l) => l.id === leagueId);
  const balance =
    showBalance && current ? (
      <BalancePill leagueId={leagueId} leagueName={current.name} balance={current.balance} />
    ) : null;
  return (
    <div className="flex items-center justify-between gap-2">
      <LeagueSheet current={leagueId} leagues={leagues} />
      {(balance || action || showBell) && (
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {balance}
          {showBell && <NotificationBell leagueId={leagueId} unread={unread} />}
        </div>
      )}
    </div>
  );
}
