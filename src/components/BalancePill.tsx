import Link from "next/link";
import { ClopeIcon } from "@/components/ui";

/** Solde de la ligue active, en haut de Paris ; mène à Moi. */
export function BalancePill({
  leagueId,
  leagueName,
  balance,
}: {
  leagueId: string;
  leagueName: string;
  balance: number;
}) {
  return (
    <Link
      href={`/l/${leagueId}/moi`}
      aria-label={`Solde dans ${leagueName} : ${balance} ${balance > 1 ? "clopes" : "clope"}`}
      className="flex min-h-[44px] items-center gap-1 rounded-full border border-line-strong bg-surface px-4 font-mono text-[15px] font-medium"
    >
      {balance}
      <span className="flex text-brand">
        <ClopeIcon size={18} />
      </span>
    </Link>
  );
}
