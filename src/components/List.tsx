import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "@/components/ui";
import { cx } from "@/lib/cx";

/** En-tête de section, en overline. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-overline text-ink-subtle">{children}</h2>;
}

/** Groupe de lignes sur surface, séparées par un filet. */
export function ListGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col rounded-md bg-surface px-4 [&>*+*]:border-t [&>*+*]:border-line">
      {children}
    </div>
  );
}

type ListRowProps = {
  label: ReactNode;
  hint?: string;
  value?: ReactNode;
  /** Valeur en mono (nombres, codes, emails). */
  mono?: boolean;
  href?: string;
  onClick?: () => void;
  /** Ligne seulement lisible : pas de chevron. */
  chevron?: boolean;
  tone?: "loss";
};

export function ListRow({
  label,
  hint,
  value,
  mono = true,
  href,
  onClick,
  chevron,
  tone,
}: ListRowProps) {
  const interactive = Boolean(href || onClick);
  const showChevron = chevron ?? interactive;
  const content = (
    <>
      <span className="flex flex-col">
        <span
          className={cx(
            "text-[15px] leading-5 font-semibold",
            tone === "loss" ? "text-loss" : "text-ink",
          )}
        >
          {label}
        </span>
        {hint && <span className="text-caption text-ink-subtle">{hint}</span>}
      </span>
      <span
        className={cx(
          "flex shrink-0 items-center gap-1 text-[14px] text-ink-muted",
          mono && "font-mono font-medium",
        )}
      >
        {value}
        {showChevron && (
          <span className="flex text-ink-subtle">
            <ChevronRightIcon size={16} />
          </span>
        )}
      </span>
    </>
  );
  const className = "flex min-h-[52px] w-full items-center justify-between gap-3 py-1 text-left";
  if (href) {
    return (
      <div>
        <Link href={href} className={className}>
          {content}
        </Link>
      </div>
    );
  }
  if (onClick) {
    return (
      <div>
        <button type="button" onClick={onClick} className={className}>
          {content}
        </button>
      </div>
    );
  }
  return (
    <div>
      <div className={className}>{content}</div>
    </div>
  );
}
