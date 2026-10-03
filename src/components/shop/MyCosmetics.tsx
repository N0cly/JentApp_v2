"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { equipAction } from "@/app/(app)/l/[ligue]/shop-actions";
import { Avatar, ShopIcon } from "@/components/ui";
import { cx } from "@/lib/cx";
import type { CosmeticType, CosmeticView } from "@/server/shop";

function Choice({
  worn,
  label,
  preview,
  onPick,
  disabled,
}: {
  worn: boolean;
  label: string;
  preview: ReactNode;
  onPick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={worn}
      disabled={disabled}
      onClick={worn ? undefined : onPick}
      className={cx(
        "flex flex-col items-center gap-1 rounded-md border-[1.5px] bg-surface px-1 py-3",
        worn ? "border-brand" : "border-surface",
      )}
    >
      {preview}
      <span className="text-[13px] leading-[18px] font-semibold">{label}</span>
      <span className={cx("text-caption", worn ? "text-brand" : "text-ink-muted")}>
        {worn ? "Porté" : "Porter"}
      </span>
    </button>
  );
}

/** Onglet Cosmétiques de Moi : ce que je possède dans la ligue, et ce que je porte. */
export function MyCosmetics({
  leagueId,
  owned,
  avatar,
  border,
  me,
}: {
  leagueId: string;
  owned: CosmeticView[];
  avatar: string | null;
  border: string | null;
  me: { username: string; photo: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const wear = (type: CosmeticType, id: string | null) =>
    startTransition(async () => {
      await equipAction(leagueId, type, id);
      router.refresh();
    });

  const preview = (src: string | null, ring?: string) => (
    <Avatar
      name={me.username}
      src={src}
      ring={ring}
      ringWidth={3}
      size={48}
      background="surface-raised"
    />
  );
  const borders = owned.filter((c) => c.type === "border");
  const avatars = owned.filter((c) => c.type === "avatar");

  return (
    <>
      <h2 className="text-overline text-ink-subtle">BORDURES</h2>
      <div className="grid shrink-0 grid-cols-3 gap-2">
        <Choice
          worn={border === null}
          label="Sans bordure"
          preview={preview(me.photo)}
          onPick={() => wear("border", null)}
          disabled={pending}
        />
        {borders.map((c) => (
          <Choice
            key={c.id}
            worn={border === c.id}
            label={c.name}
            preview={preview(me.photo, c.tintColor ?? undefined)}
            onPick={() => wear("border", c.id)}
            disabled={pending}
          />
        ))}
      </div>
      <h2 className="text-overline text-ink-subtle">AVATARS</h2>
      <div className="grid shrink-0 grid-cols-3 gap-2">
        <Choice
          worn={avatar === null}
          label="Ta photo"
          preview={preview(me.photo)}
          onPick={() => wear("avatar", null)}
          disabled={pending}
        />
        {avatars.map((c) => (
          <Choice
            key={c.id}
            worn={avatar === c.id}
            label={c.name}
            preview={preview(c.imageUrl)}
            onPick={() => wear("avatar", c.id)}
            disabled={pending}
          />
        ))}
        <Link
          href={`/l/${leagueId}/boutique`}
          className="flex flex-col items-center justify-center gap-1 rounded-md border-[1.5px] border-dashed border-line-strong bg-bg px-1 py-3 text-ink-muted"
        >
          <ShopIcon size={22} />
          <span className="text-[13px] leading-[18px] font-semibold">Boutique</span>
        </Link>
      </div>
    </>
  );
}
