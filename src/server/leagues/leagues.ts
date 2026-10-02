import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, leagueMembers, leagues, users } from "@/db/schema";
import { fieldErrors, type FieldErrors } from "@/server/auth/validation";
import { memberOrNotFound, type Role } from "@/server/auth/access";
import { NotFoundError } from "@/server/errors";
import { assertAllowed, RateLimitedError, record, rules } from "@/server/rate-limit";
import {
  createLeagueSchema,
  generateInviteCode,
  leagueMessages,
  leagueNameSchema,
  MAX_LEAGUES_PER_USER,
  MAX_MEMBERS_PER_LEAGUE,
  normalizeCode,
} from "./rules";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type Actor = { id: string };

export type Failure<F extends string = string> = {
  ok: false;
  fieldErrors?: FieldErrors<F>;
  formError?: string;
  status?: 429;
};

/** Nom affiché d'un joueur : jamais son email. */
export const DELETED_PLAYER = "Joueur supprimé";

export type AuditAction =
  | "settings.changed"
  | "role.changed"
  | "member.removed"
  | "invite.regenerated"
  | "league.transferred";

async function audit(
  tx: Tx,
  leagueId: string,
  actorId: string,
  action: AuditAction,
  details: Record<string, unknown>,
) {
  await tx.insert(auditLog).values({ leagueId, actorId, action, details });
}

async function activeLeagueCount(tx: Tx | Db, userId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.userId, userId), isNull(leagueMembers.leftAt)));
  return row?.n ?? 0;
}

async function activeMemberCount(tx: Tx | Db, leagueId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), isNull(leagueMembers.leftAt)));
  return row?.n ?? 0;
}

/** Verrouille le compte : deux adhésions simultanées ne dépassent pas 10 ligues. */
async function lockUser(tx: Tx, userId: string) {
  await tx.execute(sql`select id from ${users} where ${users.id} = ${userId} for update`);
}

/** Verrouille la ligue et vérifie le rôle de l'acteur dans la transaction. */
async function lockAs(tx: Tx, actorId: string, leagueId: string, minRole: Role) {
  await memberOrNotFound(actorId, leagueId, minRole);
  const [league] = await tx.select().from(leagues).where(eq(leagues.id, leagueId)).for("update");
  if (!league) throw new NotFoundError();
  const [member] = await tx
    .select({ role: leagueMembers.role })
    .from(leagueMembers)
    .where(
      and(
        eq(leagueMembers.leagueId, leagueId),
        eq(leagueMembers.userId, actorId),
        isNull(leagueMembers.leftAt),
      ),
    )
    .for("update");
  const rank = { player: 0, admin: 1, owner: 2 };
  if (!member || rank[member.role] < rank[minRole]) throw new NotFoundError();
  return { league, role: member.role };
}

/** Membre actif visé par une action, sinon 404. */
async function activeTarget(tx: Tx, leagueId: string, userId: string) {
  const [target] = await tx
    .select({ role: leagueMembers.role })
    .from(leagueMembers)
    .where(
      and(
        eq(leagueMembers.leagueId, leagueId),
        eq(leagueMembers.userId, userId),
        isNull(leagueMembers.leftAt),
      ),
    )
    .for("update");
  if (!target) throw new NotFoundError();
  return target;
}

// --- Créer -----------------------------------------------------------------

type CreateField = "name" | "joinGrant" | "weeklyGrant" | "seedAmount";

export async function createLeague(
  actor: Actor,
  input: unknown,
  now: Date,
): Promise<{ ok: true; leagueId: string } | Failure<CreateField>> {
  const parsed = createLeagueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  return getDb().transaction(async (tx) => {
    await lockUser(tx, actor.id);
    if ((await activeLeagueCount(tx, actor.id)) >= MAX_LEAGUES_PER_USER) {
      return { ok: false, formError: leagueMessages.tooManyLeagues } as const;
    }
    const [league] = await tx
      .insert(leagues)
      .values({ ...parsed.data, ownerId: actor.id, inviteCode: await freeCode(tx) })
      .returning({ id: leagues.id });
    await tx
      .insert(leagueMembers)
      .values({ leagueId: league!.id, userId: actor.id, role: "owner", joinedAt: now });
    return { ok: true, leagueId: league!.id } as const;
  });
}

async function freeCode(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateInviteCode();
    const [taken] = await tx
      .select({ id: leagues.id })
      .from(leagues)
      .where(eq(leagues.inviteCode, code));
    if (!taken) return code;
  }
  throw new Error("Impossible de tirer un code d'invitation libre");
}

// --- Lire ------------------------------------------------------------------

export type LeagueSummary = {
  id: string;
  name: string;
  members: number;
  balance: number;
  openBets: number;
};

/** Ligues actives d'un joueur, de la plus ancienne à la plus récente. */
export async function listMyLeagues(actor: Actor): Promise<LeagueSummary[]> {
  const rows = await getDb()
    .select({
      id: leagues.id,
      name: leagues.name,
      balance: leagueMembers.balance,
      members: sql<number>`(select count(*)::int from ${leagueMembers} m where m.league_id = ${leagues.id} and m.left_at is null)`,
    })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
    .where(and(eq(leagueMembers.userId, actor.id), isNull(leagueMembers.leftAt)))
    .orderBy(asc(leagueMembers.joinedAt));
  // Les paris arrivent en M3 : aucun n'est ouvert d'ici là.
  return rows.map((r) => ({ ...r, openBets: 0 }));
}

export type LeagueView = {
  id: string;
  name: string;
  inviteCode: string;
  joinGrant: number;
  weeklyGrant: number;
  seedAmount: number;
  members: number;
  myRole: Role;
};

export async function getLeague(actor: Actor, leagueId: string): Promise<LeagueView> {
  const { role } = await memberOrNotFound(actor.id, leagueId);
  const [league] = await getDb().select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) throw new NotFoundError();
  return {
    id: league.id,
    name: league.name,
    inviteCode: league.inviteCode,
    joinGrant: league.joinGrant,
    weeklyGrant: league.weeklyGrant,
    seedAmount: league.seedAmount,
    members: await activeMemberCount(getDb(), leagueId),
    myRole: role,
  };
}

export type MemberView = {
  userId: string;
  username: string;
  image: string | null;
  role: Role;
  joinedAt: Date;
};

/** Membres actifs : pseudo, avatar, rôle. Jamais d'email. */
export async function listMembers(actor: Actor, leagueId: string): Promise<MemberView[]> {
  await memberOrNotFound(actor.id, leagueId);
  const rows = await getDb()
    .select({
      userId: leagueMembers.userId,
      username: users.name,
      image: users.image,
      role: leagueMembers.role,
      joinedAt: leagueMembers.joinedAt,
    })
    .from(leagueMembers)
    .innerJoin(users, eq(users.id, leagueMembers.userId))
    .where(and(eq(leagueMembers.leagueId, leagueId), isNull(leagueMembers.leftAt)))
    .orderBy(asc(leagueMembers.joinedAt));
  return rows.map((r) => ({ ...r, username: r.username ?? DELETED_PLAYER }));
}

/** Pseudos à afficher pour des joueurs, y compris ceux qui ont supprimé leur compte. */
export async function playerNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: users.id, username: users.name })
    .from(users)
    .where(inArray(users.id, userIds));
  return new Map(rows.map((r) => [r.id, r.username ?? DELETED_PLAYER]));
}

// --- Rejoindre -------------------------------------------------------------

export type InvitePreview = {
  leagueId: string;
  name: string;
  members: number;
  joinGrant: number;
  invitedBy: string | null;
  alreadyMember: boolean;
};

async function findByCode(actor: Actor, rawCode: unknown, now: Date) {
  // 10 codes inconnus par heure et par compte.
  await assertAllowed(rules.inviteCode, actor.id, now);
  const code = normalizeCode(rawCode);
  const [league] = code
    ? await getDb().select().from(leagues).where(eq(leagues.inviteCode, code))
    : [];
  if (!league) {
    await record(rules.inviteCode, actor.id, now);
    return null;
  }
  return league;
}

function limitedOr<T>(error: unknown, fallback?: T): Failure | T {
  if (error instanceof RateLimitedError)
    return { ok: false, formError: error.message, status: 429 };
  if (fallback !== undefined) return fallback;
  throw error;
}

/** Aperçu avant de rejoindre : nom, nombre de membres, dotation. Rien d'autre. */
export async function previewInvite(
  actor: Actor,
  rawCode: unknown,
  now: Date,
  invitedBy?: unknown,
): Promise<{ ok: true; preview: InvitePreview } | Failure<"code">> {
  try {
    const league = await findByCode(actor, rawCode, now);
    if (!league) return { ok: false, fieldErrors: { code: leagueMessages.codeUnknown } };
    const [me] = await getDb()
      .select({ userId: leagueMembers.userId })
      .from(leagueMembers)
      .where(
        and(
          eq(leagueMembers.leagueId, league.id),
          eq(leagueMembers.userId, actor.id),
          isNull(leagueMembers.leftAt),
        ),
      );
    return {
      ok: true,
      preview: {
        leagueId: league.id,
        name: league.name,
        members: await activeMemberCount(getDb(), league.id),
        joinGrant: league.joinGrant,
        invitedBy: await activeMemberNamed(league.id, invitedBy),
        alreadyMember: me !== undefined,
      },
    };
  } catch (error) {
    return limitedOr(error);
  }
}

/** « Invité par » ne s'affiche que si le pseudo est celui d'un membre actif. */
async function activeMemberNamed(leagueId: string, username: unknown): Promise<string | null> {
  if (typeof username !== "string" || username.length === 0 || username.length > 20) return null;
  const [row] = await getDb()
    .select({ username: users.name })
    .from(leagueMembers)
    .innerJoin(users, eq(users.id, leagueMembers.userId))
    .where(
      and(
        eq(leagueMembers.leagueId, leagueId),
        isNull(leagueMembers.leftAt),
        sql`lower(${users.name}) = lower(${username})`,
      ),
    );
  return row?.username ?? null;
}

export async function joinLeague(
  actor: Actor,
  rawCode: unknown,
  now: Date,
): Promise<{ ok: true; leagueId: string } | Failure<"code">> {
  let league;
  try {
    league = await findByCode(actor, rawCode, now);
  } catch (error) {
    return limitedOr(error);
  }
  if (!league) return { ok: false, fieldErrors: { code: leagueMessages.codeUnknown } };
  const leagueId = league.id;

  return getDb().transaction(async (tx) => {
    await lockUser(tx, actor.id);
    await tx.select({ id: leagues.id }).from(leagues).where(eq(leagues.id, leagueId)).for("update");
    const [existing] = await tx
      .select()
      .from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, actor.id)));

    // Déjà membre : on l'emmène simplement dans la ligue.
    if (existing && existing.leftAt === null) return { ok: true, leagueId } as const;

    if ((await activeMemberCount(tx, leagueId)) >= MAX_MEMBERS_PER_LEAGUE) {
      return { ok: false, formError: leagueMessages.leagueFull } as const;
    }
    if ((await activeLeagueCount(tx, actor.id)) >= MAX_LEAGUES_PER_USER) {
      return { ok: false, formError: leagueMessages.tooManyLeagues } as const;
    }

    if (existing) {
      // Ancien membre : il retrouve sa ligne et son solde gelé, en joueur.
      await tx
        .update(leagueMembers)
        .set({ leftAt: null, role: "player", joinedAt: now })
        .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, actor.id)));
    } else {
      await tx
        .insert(leagueMembers)
        .values({ leagueId, userId: actor.id, role: "player", joinedAt: now });
    }
    return { ok: true, leagueId } as const;
  });
}

// --- Quitter, rôles, exclusion ---------------------------------------------

export async function leaveLeague(
  actor: Actor,
  leagueId: string,
  now: Date,
): Promise<{ ok: true } | Failure> {
  return getDb().transaction(async (tx) => {
    const { role } = await lockAs(tx, actor.id, leagueId, "player");
    if (role === "owner")
      return { ok: false, formError: leagueMessages.ownerMustTransfer } as const;
    await tx
      .update(leagueMembers)
      .set({ leftAt: now })
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, actor.id)));
    return { ok: true } as const;
  });
}

export async function changeRole(
  actor: Actor,
  leagueId: string,
  targetUserId: string,
  role: "player" | "admin",
): Promise<{ ok: true }> {
  if (role !== "player" && role !== "admin") throw new NotFoundError();
  return getDb().transaction(async (tx) => {
    await lockAs(tx, actor.id, leagueId, "owner");
    const target = await activeTarget(tx, leagueId, targetUserId);
    if (target.role === "owner") throw new NotFoundError();
    if (target.role !== role) {
      await tx
        .update(leagueMembers)
        .set({ role })
        .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, targetUserId)));
      await audit(tx, leagueId, actor.id, "role.changed", {
        userId: targetUserId,
        from: target.role,
        to: role,
      });
    }
    return { ok: true } as const;
  });
}

/** Exclure : comme un départ. Pour empêcher un retour, régénérer le code. */
export async function removeMember(
  actor: Actor,
  leagueId: string,
  targetUserId: string,
  now: Date,
): Promise<{ ok: true }> {
  return getDb().transaction(async (tx) => {
    await lockAs(tx, actor.id, leagueId, "owner");
    const target = await activeTarget(tx, leagueId, targetUserId);
    if (target.role === "owner") throw new NotFoundError();
    await tx
      .update(leagueMembers)
      .set({ leftAt: now })
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, targetUserId)));
    await audit(tx, leagueId, actor.id, "member.removed", { userId: targetUserId });
    return { ok: true } as const;
  });
}

// --- Réglages, code, transfert, suppression --------------------------------

export async function renameLeague(
  actor: Actor,
  leagueId: string,
  input: unknown,
): Promise<{ ok: true } | Failure<"name">> {
  const parsed = leagueNameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: { name: leagueMessages.nameLength } };
  return getDb().transaction(async (tx) => {
    const { league } = await lockAs(tx, actor.id, leagueId, "owner");
    if (league.name !== parsed.data) {
      await tx.update(leagues).set({ name: parsed.data }).where(eq(leagues.id, leagueId));
      await audit(tx, leagueId, actor.id, "settings.changed", {
        name: { from: league.name, to: parsed.data },
      });
    }
    return { ok: true } as const;
  });
}

/** Nouveau code : l'ancien cesse de marcher aussitôt. */
export async function regenerateInviteCode(
  actor: Actor,
  leagueId: string,
): Promise<{ ok: true; code: string }> {
  return getDb().transaction(async (tx) => {
    await lockAs(tx, actor.id, leagueId, "owner");
    const code = await freeCode(tx);
    await tx.update(leagues).set({ inviteCode: code }).where(eq(leagues.id, leagueId));
    await audit(tx, leagueId, actor.id, "invite.regenerated", {});
    return { ok: true, code } as const;
  });
}

/** Vers un membre actif ; l'ancien owner devient admin, dans la même transaction. */
export async function transferLeague(
  actor: Actor,
  leagueId: string,
  targetUserId: string,
): Promise<{ ok: true }> {
  if (targetUserId === actor.id) throw new NotFoundError();
  return getDb().transaction(async (tx) => {
    await lockAs(tx, actor.id, leagueId, "owner");
    await activeTarget(tx, leagueId, targetUserId);
    await tx
      .update(leagueMembers)
      .set({ role: "admin" })
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, actor.id)));
    await tx
      .update(leagueMembers)
      .set({ role: "owner" })
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, targetUserId)));
    await tx.update(leagues).set({ ownerId: targetUserId }).where(eq(leagues.id, leagueId));
    await audit(tx, leagueId, actor.id, "league.transferred", { from: actor.id, to: targetUserId });
    return { ok: true } as const;
  });
}

/** Confirmation en écrivant le nom de la ligue ; tout ce qui lui appartient part avec. */
export async function deleteLeague(
  actor: Actor,
  leagueId: string,
  confirmation: unknown,
): Promise<{ ok: true } | Failure<"confirmation">> {
  return getDb().transaction(async (tx) => {
    const { league } = await lockAs(tx, actor.id, leagueId, "owner");
    if (typeof confirmation !== "string" || confirmation.trim() !== league.name) {
      return { ok: false, fieldErrors: { confirmation: leagueMessages.deleteConfirm } } as const;
    }
    await tx.delete(leagues).where(eq(leagues.id, leagueId));
    return { ok: true } as const;
  });
}
