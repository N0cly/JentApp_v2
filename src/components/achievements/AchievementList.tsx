import { LockIcon, MedalIcon } from "@/components/ui";
import { cx } from "@/lib/cx";
import type { AchievementView } from "@/server/achievements";

/** Onglet Succès de Moi (moi-succes.html). */
export function AchievementList({
  items,
  unlocked,
  total,
  leagueName,
}: {
  items: AchievementView[];
  unlocked: number;
  total: number;
  leagueName: string;
}) {
  return (
    <>
      <p className="text-caption text-ink-muted">
        {unlocked} succès sur {total} {unlocked > 1 ? "débloqués" : "débloqué"} dans {leagueName}
      </p>
      <div className="flex flex-col">
        {items.map((item) => {
          if (item.hidden) {
            return (
              <div key={item.id} className="flex min-h-[64px] items-center gap-3">
                <span className="flex size-[44px] shrink-0 items-center justify-center rounded-full bg-surface text-ink-subtle">
                  <LockIcon size={20} />
                </span>
                <span className="flex min-w-0 grow flex-col">
                  <span className="text-[15px] leading-5 font-semibold text-ink-muted">
                    Succès caché
                  </span>
                  <span className="text-caption text-ink-subtle">
                    Continue à jouer pour le découvrir
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[13px] font-medium text-ink-subtle">
                  ?
                </span>
              </div>
            );
          }
          const percent = item.progress
            ? Math.round((item.progress.current * 100) / item.progress.target)
            : 0;
          return (
            <div key={item.id} className="flex min-h-[64px] items-center gap-3">
              <span
                className={cx(
                  "flex size-[44px] shrink-0 items-center justify-center rounded-full",
                  item.unlocked ? "bg-brand-soft text-brand" : "bg-surface text-ink-subtle",
                )}
              >
                <MedalIcon size={20} />
              </span>
              <span className="flex min-w-0 grow flex-col">
                <span
                  className={cx(
                    "text-[15px] leading-5 font-semibold",
                    item.unlocked ? "text-ink" : "text-ink-muted",
                  )}
                >
                  {item.name}
                </span>
                <span className="text-caption text-ink-subtle">
                  {item.description}
                  {item.progress && ` · ${item.progress.current} sur ${item.progress.target}`}
                </span>
                {item.progress && (
                  <span
                    className="mt-1 block h-[6px] overflow-hidden rounded-full bg-surface-raised"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={item.progress.target}
                    aria-valuenow={item.progress.current}
                  >
                    <span
                      className="block h-[6px] rounded-full bg-brand"
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                )}
              </span>
              <span
                className={cx(
                  "shrink-0 font-mono text-[13px] font-medium",
                  item.unlocked ? "text-win" : "text-ink-subtle",
                )}
              >
                +{item.reward}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
