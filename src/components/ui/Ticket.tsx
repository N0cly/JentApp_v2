import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/** Fond derrière le ticket : les encoches de la découpe en prennent la couleur. */
type Behind = "bg" | "surface" | "surface-raised";

const behindColors: Record<Behind, string> = {
  bg: "[--ticket-behind:var(--bg)]",
  surface: "[--ticket-behind:var(--surface)]",
  "surface-raised": "[--ticket-behind:var(--surface-raised)]",
};

type TicketProps = {
  behind: Behind;
  /** Tampon posé en haut à droite. */
  stamp?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** La signature : seul élément sur papier. */
export function Ticket({ behind, stamp, className, children }: TicketProps) {
  return (
    <div
      className={cx("relative rounded-sm bg-paper text-on-paper", behindColors[behind], className)}
    >
      {stamp && <div className="absolute top-3 right-4">{stamp}</div>}
      {children}
    </div>
  );
}

export function TicketSection({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 p-4">{children}</div>;
}

/** Mention du ticket, en overline, éventuellement à deux colonnes. */
export function TicketOverline({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className="text-overline flex justify-between gap-2 text-on-paper-muted">
      <span className="shrink-0">{children}</span>
      {end && <span className="min-w-0 truncate">{end}</span>}
    </div>
  );
}

export function TicketTitle({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[17px] leading-[22px] font-bold">{children}</div>;
}

type TicketRowProps = {
  label: string;
  children: ReactNode;
  /** Gain ou perte imprimés : encre `on-paper-win` ou `on-paper-loss`, en grand. */
  outcome?: "win" | "loss";
};

export function TicketRow({ label, children, outcome }: TicketRowProps) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-[14px] leading-5 font-medium">
      <span className="shrink-0 text-on-paper-muted">{label}</span>
      {/* Un montant reste d'un tenant ; un pseudo long passe à la ligne. */}
      <span
        className={cx(
          "ml-auto min-w-0 text-right [overflow-wrap:anywhere]",
          outcome && "text-[28px] leading-8",
          outcome === "win" && "text-on-paper-win",
          outcome === "loss" && "text-on-paper-loss",
        )}
      >
        {children}
      </span>
    </div>
  );
}

/** Ligne de découpe : pointillés et deux encoches rondes de 16 px. */
export function TicketCut() {
  return (
    <div aria-hidden="true" className="relative h-[16px]">
      <div className="absolute inset-x-4 top-[7px] border-t-[1.5px] border-dashed border-on-paper-muted" />
      <span className="absolute top-0 -left-2 size-[16px] rounded-full bg-(--ticket-behind)" />
      <span className="absolute top-0 -right-2 size-[16px] rounded-full bg-(--ticket-behind)" />
    </div>
  );
}
