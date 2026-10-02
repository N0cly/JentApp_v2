import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { betOptions, bets, wagers } from "@/db/schema";
import type { Role } from "@/server/auth/access";
import { memberOrNotFound } from "@/server/auth/access";
import { NotFoundError } from "@/server/errors";
import { playerNames } from "@/server/leagues";
import type { Moment } from "./rules";
import { settleDelayMs } from "./rules";
import { settle } from "./settle";
import { betState, type BetState } from "./state";

type BetRow = typeof bets.$inferSelect;
type WagerRow = typeof wagers.$inferSelect;
type OptionRow = typeof betOptions.$inferSelect;

export type RefundReason = "alone" | "cancelled" | "tie" | "expired";

export type MyWager = { optionId: string; amount: number; payout: number | null };

export type OptionTotals = { id: string; label: string; amount: number; count: number };

export type BetPermissions = {
  canEdit: boolean;
  canCancel: boolean;
  canResolve: boolean;
  canCorrect: boolean;
};

type Common = {
  id: string;
  moment: Moment;
  opensAt: Date;
  closesAt: Date;
  hiddenUntilOpen: boolean;
  creator: string;
  permissions: BetPermissions;
};

/**
 * Ce que voit un joueur d'un pari (docs/M3.md, § Visibilité). Les champs
 * absents ne sont pas masqués par l'interface : ils ne quittent pas le serveur.
 */
export type BetView =
  | (Common & { state: "scheduled"; mystery: true })
  | (Common & {
      state: "scheduled";
      mystery: false;
      question: string;
      options: { id: string; label: string }[];
    })
  | (Common & {
      state: "open";
      question: string;
      options: { id: string; label: string }[];
      pot: number;
      bettors: number;
      myWager: MyWager | null;
    })
  | (Common & {
      state: "closed" | "resolved" | "settled" | "cancelled";
      question: string;
      options: OptionTotals[];
      pot: number;
      bettors: number;
      myWager: MyWager | null;
      wagers: { player: string; optionId: string; amount: number; payout: number | null }[];
      winningOptionId: string | null;
      resolvedBy: string | null;
      resolvedAt: Date | null;
      /** Versement prévu (état resolved). */
      settlesAt: Date | null;
      settledAt: Date | null;
      seed: number;
      /** Cote finale en centièmes, quand il y a des gagnants et des perdants. */
      oddsCents: number | null;
      /** Gain prévu ou versé pour moi (0 si perdu). */
      myGain: number | null;
      /** Mises rendues, et pourquoi. */
      refund: RefundReason | null;
      cancelledAt: Date | null;
    });

function permissions(
  bet: BetRow,
  state: BetState,
  me: string,
  role: Role,
  staked: boolean,
  now: Date,
): BetPermissions {
  const manager = role === "admin" || role === "owner";
  const creator = bet.createdBy === me;
  const beforeClose = state === "scheduled" || state === "open";
  const inDelay =
    state === "resolved" && now.getTime() < bet.resolvedAt!.getTime() + settleDelayMs();
  return {
    canEdit: creator && beforeClose && !staked,
    canCancel:
      (creator && beforeClose) || (manager && state !== "settled" && state !== "cancelled"),
    canResolve: state === "closed" && (creator || manager),
    canCorrect: inDelay && (bet.resolvedBy === me || manager),
  };
}

function refundReason(bet: BetRow, settlementKind: string | null): RefundReason | null {
  if (bet.cancelReason === "tie") return "tie";
  if (bet.cancelReason === "expired") return "expired";
  if (bet.cancelledAt) return "cancelled";
  if (bet.settledAt && settlementKind === "refund") return "alone";
  return null;
}

function buildView(
  bet: BetRow,
  options: OptionRow[],
  stakes: WagerRow[],
  names: Map<string, string>,
  me: string,
  role: Role,
  now: Date,
): BetView {
  const state = betState(bet, now);
  const mine = stakes.find((w) => w.userId === me);
  const common: Common = {
    id: bet.id,
    moment: bet.moment,
    opensAt: bet.opensAt,
    closesAt: bet.closesAt,
    hiddenUntilOpen: bet.hiddenUntilOpen,
    creator: names.get(bet.createdBy) ?? "",
    permissions: permissions(bet, state, me, role, stakes.length > 0, now),
  };
  const plainOptions = options.map((o) => ({ id: o.id, label: o.label }));
  const pot = stakes.reduce((sum, w) => sum + w.amount, 0);
  const myWager = mine
    ? { optionId: mine.optionId, amount: mine.amount, payout: mine.payout }
    : null;

  if (state === "scheduled") {
    if (bet.hiddenUntilOpen && bet.createdBy !== me) return { ...common, state, mystery: true };
    return { ...common, state, mystery: false, question: bet.question, options: plainOptions };
  }
  if (state === "open") {
    return {
      ...common,
      state,
      question: bet.question,
      options: plainOptions,
      pot,
      bettors: stakes.length,
      myWager,
    };
  }

  const settlement =
    bet.winningOptionId && !bet.cancelledAt
      ? settle({
          stakes: stakes.map((w) => ({
            userId: w.userId,
            optionId: w.optionId,
            amount: w.amount,
            createdAt: w.createdAt,
          })),
          winningOptionId: bet.winningOptionId,
          seed: bet.seed,
        })
      : null;
  const refund = refundReason(bet, settlement?.kind ?? null);
  return {
    ...common,
    state,
    question: bet.question,
    options: options.map((o) => {
      const on = stakes.filter((w) => w.optionId === o.id);
      return {
        id: o.id,
        label: o.label,
        amount: on.reduce((s, w) => s + w.amount, 0),
        count: on.length,
      };
    }),
    // Le pot affiché ne compte la cagnotte qu'une fois le résultat saisi.
    pot: pot + (settlement?.kind === "payout" ? bet.seed : 0),
    bettors: stakes.length,
    myWager,
    wagers: stakes.map((w) => ({
      player: names.get(w.userId) ?? "",
      optionId: w.optionId,
      amount: w.amount,
      payout: w.payout,
    })),
    winningOptionId: bet.cancelledAt ? null : bet.winningOptionId,
    resolvedBy: bet.resolvedBy ? (names.get(bet.resolvedBy) ?? null) : null,
    resolvedAt: bet.resolvedAt,
    settlesAt: state === "resolved" ? new Date(bet.resolvedAt!.getTime() + settleDelayMs()) : null,
    settledAt: bet.settledAt,
    seed: settlement?.kind === "payout" ? bet.seed : 0,
    oddsCents: settlement?.kind === "payout" ? settlement.oddsCents : null,
    myGain: mine && settlement ? (settlement.payouts.get(me) ?? 0) : (mine?.payout ?? null),
    refund,
    cancelledAt: bet.cancelledAt,
  };
}

async function load(betRows: BetRow[]) {
  const ids = betRows.map((b) => b.id);
  if (ids.length === 0) return { options: [], stakes: [], names: new Map<string, string>() };
  const [options, stakes] = await Promise.all([
    getDb()
      .select()
      .from(betOptions)
      .where(inArray(betOptions.betId, ids))
      .orderBy(betOptions.position),
    getDb().select().from(wagers).where(inArray(wagers.betId, ids)).orderBy(wagers.createdAt),
  ]);
  const people = new Set<string>();
  for (const b of betRows) {
    people.add(b.createdBy);
    if (b.resolvedBy) people.add(b.resolvedBy);
  }
  for (const w of stakes) people.add(w.userId);
  return { options, stakes, names: await playerNames([...people]) };
}

/** Un pari, vu par l'acteur. 404 pour un non-membre ou un pari d'une autre ligue. */
export async function getBet(
  actor: { id: string },
  leagueId: string,
  betId: string,
  now: Date,
): Promise<BetView> {
  const { role } = await memberOrNotFound(actor.id, leagueId);
  const [bet] = await getDb()
    .select()
    .from(bets)
    .where(and(eq(bets.id, betId), eq(bets.leagueId, leagueId)));
  if (!bet) throw new NotFoundError();
  const { options, stakes, names } = await load([bet]);
  return buildView(bet, options, stakes, names, actor.id, role, now);
}

const ORDER: Record<BetState, number> = {
  open: 0,
  closed: 1,
  resolved: 2,
  scheduled: 3,
  settled: 4,
  cancelled: 4,
};
const RECENT_MS = 24 * 3600_000;

/**
 * Onglet Paris : ouverts (fermeture la plus proche d'abord), fermés sans
 * résultat, résultat saisi, programmés, puis réglés ou annulés depuis moins
 * de 24 heures.
 */
export async function listBets(
  actor: { id: string },
  leagueId: string,
  now: Date,
): Promise<BetView[]> {
  const { role } = await memberOrNotFound(actor.id, leagueId);
  const rows = (await getDb().select().from(bets).where(eq(bets.leagueId, leagueId))).filter(
    (b) => {
      const ended = b.settledAt ?? b.cancelledAt;
      return !ended || now.getTime() - ended.getTime() < RECENT_MS;
    },
  );
  const { options, stakes, names } = await load(rows);
  return rows
    .map((bet) => ({
      bet,
      view: buildView(
        bet,
        options.filter((o) => o.betId === bet.id),
        stakes.filter((w) => w.betId === bet.id),
        names,
        actor.id,
        role,
        now,
      ),
    }))
    .sort((a, b) => {
      const byState = ORDER[a.view.state] - ORDER[b.view.state];
      if (byState !== 0) return byState;
      if (a.view.state === "scheduled") return a.bet.opensAt.getTime() - b.bet.opensAt.getTime();
      if (a.view.state === "settled" || a.view.state === "cancelled") {
        const ea = (a.bet.settledAt ?? a.bet.cancelledAt)!.getTime();
        const eb = (b.bet.settledAt ?? b.bet.cancelledAt)!.getTime();
        return eb - ea;
      }
      return a.bet.closesAt.getTime() - b.bet.closesAt.getTime();
    })
    .map((x) => x.view);
}
