import type { Role } from "@/server/auth/access";
import { cx } from "@/lib/cx";

export const roleLabels: Record<Role, string> = {
  owner: "OWNER",
  admin: "ADMIN",
  player: "JOUEUR",
};

/** Rôle dans la ligue, en overline. L'owner porte le laiton. */
export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cx(
        "text-overline rounded-sm border px-2 py-1",
        role === "owner" ? "border-brand text-brand" : "border-line-strong text-ink-muted",
      )}
    >
      {roleLabels[role]}
    </span>
  );
}
