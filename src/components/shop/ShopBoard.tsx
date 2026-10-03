"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { equipAction, purchaseAction } from "@/app/(app)/l/[ligue]/shop-actions";
import { FormMessage } from "@/components/FormMessage";
import { Amount, Avatar, BottomSheet, Button, ClopeIcon, Segmented } from "@/components/ui";
import type { ShopItem } from "@/server/shop";

type Tab = "avatar" | "border";

const tabs = [
  { value: "avatar", label: "Avatars" },
  { value: "border", label: "Bordures" },
] as const;

/** Aperçu : une bordure autour de mon image, ou l'avatar lui-même. */
export function CosmeticPreview({
  item,
  me,
  size,
  background = "surface-raised",
}: {
  item: Pick<ShopItem, "type" | "imageUrl" | "tintColor">;
  me: { username: string; image: string | null };
  size: 48 | 56;
  /** Fond derrière l'initiale : surface-raised sur une carte, surface sur une feuille. */
  background?: "surface" | "surface-raised";
}) {
  return item.type === "border" ? (
    <Avatar
      name={me.username}
      src={me.image}
      ring={item.tintColor ?? undefined}
      ringWidth={3}
      size={size}
      background={background}
    />
  ) : (
    <Avatar
      name={me.username}
      src={item.imageUrl}
      ringWidth={3}
      size={size}
      background={background}
    />
  );
}

function CardAction({
  item,
  onBuy,
  onWear,
  pending,
}: {
  item: ShopItem;
  onBuy: () => void;
  onWear: () => void;
  pending: boolean;
}) {
  const box = "flex min-h-[44px] w-full items-center justify-center";
  if (item.status === "worn") {
    return <span className={`${box} text-[14px] leading-5 font-bold text-brand`}>Porté</span>;
  }
  const button = `${box} gap-1 rounded-md border border-line-strong bg-surface-raised`;
  if (item.status === "owned") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={onWear}
        className={`${button} text-[14px] leading-5 font-bold`}
      >
        Porter
      </button>
    );
  }
  if (item.missing > 0) {
    return (
      <span className={`${box} flex-col`}>
        <span className="flex items-center gap-1 font-mono text-[15px] leading-5 font-medium text-ink-subtle">
          {item.price}
          <ClopeIcon size={16} />
        </span>
        <span className="text-caption text-loss">Il te manque {item.missing}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onBuy}
      aria-label={`Acheter ${item.name} pour ${item.price} clopes`}
      className={`${button} font-mono text-[15px] leading-5 font-medium`}
    >
      <Amount value={item.price} />
    </button>
  );
}

/** Boutique : bascule Avatars / Bordures, cartes, confirmation d'achat. */
export function ShopBoard({
  leagueId,
  leagueName,
  items,
  me,
}: {
  leagueId: string;
  leagueName: string;
  items: ShopItem[];
  me: { username: string; image: string | null };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(items.some((i) => i.type === "avatar") ? "avatar" : "border");
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = items.filter((i) => i.type === tab);

  const wear = (item: ShopItem) =>
    startTransition(async () => {
      await equipAction(leagueId, item.type, item.id);
      router.refresh();
    });

  const buy = () =>
    startTransition(async () => {
      if (!buying) return;
      const result = await purchaseAction(leagueId, buying.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setBuying(null);
      router.refresh();
    });

  return (
    <main className="flex grow flex-col gap-3 px-5 pt-2 pb-6">
      <Segmented
        label="Type de cosmétique"
        options={tabs}
        value={tab}
        onChange={setTab}
        className="shrink-0"
      />
      <p className="text-caption text-ink-muted">Tes achats valent pour {leagueName} uniquement.</p>
      {shown.length === 0 ? (
        <p className="text-body py-8 text-center text-ink-muted">
          {tab === "avatar"
            ? "Aucun avatar en vente pour l'instant."
            : "Aucune bordure en vente pour l'instant."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {shown.map((item) => (
            <div
              key={item.id}
              className="flex flex-col items-center gap-2 rounded-lg bg-surface p-3"
            >
              <CosmeticPreview item={item} me={me} size={56} />
              <span className="text-[15px] leading-5 font-semibold">{item.name}</span>
              <div className="self-stretch">
                <CardAction
                  item={item}
                  pending={pending}
                  onWear={() => wear(item)}
                  onBuy={() => {
                    setError(null);
                    setBuying(item);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <BottomSheet
        open={buying !== null}
        onClose={() => setBuying(null)}
        title={buying ? `Acheter ${buying.name} pour ${buying.price} clopes ?` : ""}
      >
        {buying && (
          <>
            {error && <FormMessage>{error}</FormMessage>}
            <div className="flex items-center gap-3">
              <CosmeticPreview item={buying} me={me} size={56} background="surface" />
              <span className="flex grow flex-col">
                <span className="text-caption text-ink-subtle">Solde après achat</span>
                {buying.balanceAfter !== null && <Amount value={buying.balanceAfter} />}
              </span>
            </div>
            <Button onClick={buy} disabled={pending}>
              Acheter
            </Button>
          </>
        )}
      </BottomSheet>
    </main>
  );
}
