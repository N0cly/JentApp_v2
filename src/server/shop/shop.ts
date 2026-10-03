// Boutique (docs/M6.md, § Cosmétiques) : achat et équipement, par ligue.

import { and, asc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cosmetics, leagueMembers, memberCosmetics } from "@/db/schema";
import { isUuid, memberOrNotFound } from "@/server/auth/access";
import { NotFoundError } from "@/server/errors";
import { InsufficientBalanceError, post, type Tx } from "@/server/ledger";
import { notify } from "@/server/realtime/notify";

export type CosmeticType = "avatar" | "border";

export const shopMessages = {
  insufficient: (missing: number) => `Il te manque ${missing} ${missing > 1 ? "clopes" : "clope"}.`,
  owned: "Tu l'as déjà dans cette ligue.",
  unavailable: "Ce cosmétique n'est plus en vente.",
};

export type ShopResult = { ok: true; balance: number } | { ok: false; error: string };

const wornColumn = {
  avatar: leagueMembers.avatarCosmeticId,
  border: leagueMembers.borderCosmeticId,
} as const;

const wornKey = { avatar: "avatarCosmeticId", border: "borderCosmeticId" } as const;

function memberWhere(leagueId: string, userId: string) {
  return and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId));
}

/** Possédé dans la ligue : acheté ici, ou gratuit (possédé d'office par tous). */
async function owns(
  tx: Tx,
  leagueId: string,
  userId: string,
  cosmetic: { id: string; price: number },
) {
  if (cosmetic.price === 0) return true;
  const [row] = await tx
    .select({ id: memberCosmetics.cosmeticId })
    .from(memberCosmetics)
    .where(
      and(
        eq(memberCosmetics.leagueId, leagueId),
        eq(memberCosmetics.userId, userId),
        eq(memberCosmetics.cosmeticId, cosmetic.id),
      ),
    );
  return row !== undefined;
}

/**
 * Acheter : membre actif, cosmétique actif et pas encore possédé dans cette
 * ligue. Débit, possession et équipement dans une seule transaction ; solde
 * insuffisant, rien n'est écrit. La clé primaire de member_cosmetics garantit
 * un seul achat, donc un seul débit.
 */
export async function purchase(
  actor: { id: string },
  leagueId: string,
  cosmeticId: string,
  now: Date,
): Promise<ShopResult> {
  await memberOrNotFound(actor.id, leagueId);
  if (!isUuid(cosmeticId)) throw new NotFoundError();
  const [cosmetic] = await getDb().select().from(cosmetics).where(eq(cosmetics.id, cosmeticId));
  if (!cosmetic) throw new NotFoundError();

  try {
    return await getDb().transaction(async (tx) => {
      // Les autres vérifications, sous verrou sur le cosmétique.
      const [fresh] = await tx
        .select()
        .from(cosmetics)
        .where(eq(cosmetics.id, cosmeticId))
        .for("share");
      if (!fresh) throw new NotFoundError();
      if (fresh.price === 0) return { ok: false, error: shopMessages.owned } as const;
      if (!fresh.active) return { ok: false, error: shopMessages.unavailable } as const;

      const inserted = await tx
        .insert(memberCosmetics)
        .values({
          leagueId,
          userId: actor.id,
          cosmeticId,
          pricePaid: fresh.price,
          acquiredAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: memberCosmetics.cosmeticId });
      if (inserted.length === 0) return { ok: false, error: shopMessages.owned } as const;

      const { balance } = await post(tx, {
        leagueId,
        userId: actor.id,
        delta: -fresh.price,
        reason: "purchase",
        refId: cosmeticId,
        uniqueKey: `purchase:${leagueId}:${actor.id}:${cosmeticId}`,
      });
      // Porté aussitôt.
      await tx
        .update(leagueMembers)
        .set({ [wornKey[fresh.type]]: cosmeticId })
        .where(memberWhere(leagueId, actor.id));
      await notify(tx, { league: leagueId, type: "member.changed", user: actor.id });
      const [after] = await tx
        .select({ balance: leagueMembers.balance })
        .from(leagueMembers)
        .where(memberWhere(leagueId, actor.id));
      return { ok: true, balance: after?.balance ?? balance } as const;
    });
  } catch (error) {
    if (!(error instanceof InsufficientBalanceError)) throw error;
    const [row] = await getDb()
      .select({ balance: leagueMembers.balance })
      .from(leagueMembers)
      .where(memberWhere(leagueId, actor.id));
    return { ok: false, error: shopMessages.insufficient(cosmetic.price - (row?.balance ?? 0)) };
  }
}

/**
 * Porter un cosmétique possédé dans cette ligue, ou retirer (null) : « Ta
 * photo » pour l'avatar, « Sans bordure » pour la bordure. Un cosmétique
 * désactivé reste portable par qui le possède.
 */
export async function equip(
  actor: { id: string },
  leagueId: string,
  type: CosmeticType,
  cosmeticId: string | null,
): Promise<{ ok: true }> {
  if (type !== "avatar" && type !== "border") throw new NotFoundError();
  await memberOrNotFound(actor.id, leagueId);
  return getDb().transaction(async (tx) => {
    if (cosmeticId !== null) {
      if (!isUuid(cosmeticId)) throw new NotFoundError();
      const [cosmetic] = await tx.select().from(cosmetics).where(eq(cosmetics.id, cosmeticId));
      if (!cosmetic || cosmetic.type !== type) throw new NotFoundError();
      if (!(await owns(tx, leagueId, actor.id, cosmetic))) throw new NotFoundError();
    }
    await tx
      .update(leagueMembers)
      .set({ [wornKey[type]]: cosmeticId })
      .where(memberWhere(leagueId, actor.id));
    await notify(tx, { league: leagueId, type: "member.changed", user: actor.id });
    return { ok: true } as const;
  });
}

export type CosmeticView = {
  id: string;
  type: CosmeticType;
  name: string;
  imageUrl: string | null;
  tintColor: string | null;
  price: number;
};

export type ShopItem = CosmeticView & {
  /** Porté, possédé (à porter), ou à acheter avec ce qu'il manque. */
  status: "worn" | "owned" | "buy";
  missing: number;
};

const view = (c: typeof cosmetics.$inferSelect): CosmeticView => ({
  id: c.id,
  type: c.type,
  name: c.name,
  imageUrl: c.imageUrl,
  tintColor: c.tintColor,
  price: c.price,
});

async function wornAndOwned(leagueId: string, userId: string) {
  const [member] = await getDb()
    .select({
      balance: leagueMembers.balance,
      avatar: wornColumn.avatar,
      border: wornColumn.border,
    })
    .from(leagueMembers)
    .where(memberWhere(leagueId, userId));
  const bought = await getDb()
    .select({ id: memberCosmetics.cosmeticId })
    .from(memberCosmetics)
    .where(and(eq(memberCosmetics.leagueId, leagueId), eq(memberCosmetics.userId, userId)));
  return { member: member!, bought: new Set(bought.map((b) => b.id)) };
}

/** Boutique de la ligue : cosmétiques actifs, dans l'ordre, avec mon état pour chacun. */
export async function shopView(
  actor: { id: string },
  leagueId: string,
): Promise<{ balance: number; items: ShopItem[] }> {
  await memberOrNotFound(actor.id, leagueId);
  const [rows, { member, bought }] = await Promise.all([
    getDb()
      .select()
      .from(cosmetics)
      .where(eq(cosmetics.active, true))
      .orderBy(asc(cosmetics.position), asc(cosmetics.createdAt)),
    wornAndOwned(leagueId, actor.id),
  ]);
  return {
    balance: member.balance,
    items: rows.map((c) => {
      const worn = member[c.type] === c.id;
      const owned = c.price === 0 || bought.has(c.id);
      return {
        ...view(c),
        status: worn ? "worn" : owned ? "owned" : "buy",
        missing: worn || owned ? 0 : Math.max(0, c.price - member.balance),
      };
    }),
  };
}

/** Ce que je possède dans la ligue (désactivés compris), et ce que je porte. */
export async function myCosmetics(
  actor: { id: string },
  leagueId: string,
): Promise<{ owned: CosmeticView[]; avatar: string | null; border: string | null }> {
  await memberOrNotFound(actor.id, leagueId);
  const { member, bought } = await wornAndOwned(leagueId, actor.id);
  const rows = await getDb()
    .select()
    .from(cosmetics)
    .where(
      bought.size > 0
        ? or(eq(cosmetics.price, 0), inArray(cosmetics.id, [...bought]))
        : eq(cosmetics.price, 0),
    )
    .orderBy(asc(cosmetics.position), asc(cosmetics.createdAt));
  return { owned: rows.map(view), avatar: member.avatar, border: member.border };
}
