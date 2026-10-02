import Link from "next/link";
import { cx } from "@/lib/cx";
import { ChatIcon, TicketIcon, TrophyIcon, UserIcon } from "./icons";

export type Tab = "paris" | "classement" | "chat" | "moi";

const tabs = [
  { id: "paris", label: "Paris", Icon: TicketIcon },
  { id: "classement", label: "Classement", Icon: TrophyIcon },
  { id: "chat", label: "Chat", Icon: ChatIcon },
  { id: "moi", label: "Moi", Icon: UserIcon },
] as const;

type TabBarProps = {
  active: Tab;
  hrefs: Record<Tab, string>;
};

/** Quatre onglets, actif en brand. Respecte la zone sûre du bas. */
export function TabBar({ active, hrefs }: TabBarProps) {
  return (
    <nav
      aria-label="Navigation principale"
      className="grid shrink-0 grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map(({ id, label, Icon }) => (
        <Link
          key={id}
          href={hrefs[id]}
          aria-current={id === active ? "page" : undefined}
          className={cx(
            "flex h-[72px] flex-col items-center justify-center gap-1 text-[12px] leading-4 font-semibold",
            id === active ? "text-brand" : "text-ink-muted",
          )}
        >
          <Icon size={22} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
