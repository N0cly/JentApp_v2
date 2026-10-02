import { Amount, ClopeIcon, JointIcon, PaquetIcon } from "@/components/ui";
import { breakdown, type Unit } from "@/lib/units";

const icons: Record<Unit, typeof ClopeIcon> = {
  paquet: PaquetIcon,
  joint: JointIcon,
  clope: ClopeIcon,
};

/** Bloc « Solde dans {ligue} » de Moi : le solde et sa décomposition. */
export function BalanceCard({ leagueName, balance }: { leagueName: string; balance: number }) {
  const parts = breakdown(balance);
  return (
    <section className="flex shrink-0 items-end justify-between rounded-lg bg-surface px-5 py-4">
      <div className="flex flex-col gap-1">
        <span className="text-overline text-ink-subtle">SOLDE DANS {leagueName.toUpperCase()}</span>
        <Amount value={balance} size="xl" />
        {parts.length > 0 && (
          <span className="text-caption flex items-center gap-3 text-ink-muted">
            {parts.map(({ unit, label }) => {
              const Icon = icons[unit];
              return (
                <span key={unit} className="flex items-center gap-1">
                  <Icon size={14} />
                  {label}
                </span>
              );
            })}
          </span>
        )}
      </div>
    </section>
  );
}
