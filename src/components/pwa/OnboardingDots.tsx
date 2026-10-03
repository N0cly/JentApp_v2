import { cx } from "@/lib/cx";

/** Points du parcours d'accueil : trois de présentation, installer, notifications. */
export function OnboardingDots({ active, total = 5 }: { active: number; total?: number }) {
  return (
    <div aria-hidden="true" className="flex justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cx(
            "h-[6px] rounded-full",
            i === active ? "w-[20px] bg-brand" : "w-[6px] bg-line-strong",
          )}
        />
      ))}
    </div>
  );
}
