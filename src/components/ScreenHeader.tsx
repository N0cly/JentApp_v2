import type { ReactNode } from "react";
import { ChevronLeftIcon, IconButton } from "@/components/ui";

/** Barre du haut d'un écran secondaire : retour, titre, action éventuelle. */
export function ScreenHeader({
  back,
  title,
  action,
}: {
  back: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 px-3 pt-3 pb-1">
      <IconButton label="Retour" href={back} className="text-ink">
        <ChevronLeftIcon size={22} />
      </IconButton>
      <span className="min-w-0 grow truncate text-[17px] leading-[22px] font-bold">{title}</span>
      {action}
    </div>
  );
}
