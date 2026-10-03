import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { leagueMembers, notifications } from "@/db/schema";
import {
  cancelBet,
  correctResult,
  createBet,
  placeWager,
  resolveBet,
  settleDue,
} from "@/server/bets";
import { sendMessage } from "@/server/chat";
import { joinLeague, leaveLeague, offerRound, removeMember } from "@/server/leagues";
import { at, CLOSE, T0 } from "@/test/bet-scenarios";
import { leagueWith, optionIds } from "@/test/bets";
import { resetDb } from "@/test/db";
import { notify } from "./create";

type Ctx = Awaited<ReturnType<typeof leagueWith>>;
const after = (minutes: number) => new Date(CLOSE.getTime() + minutes * 60_000);

async function inbox(userId: string) {
  return getDb().select().from(notifications).where(eq(notifications.userId, userId));
}

async function types(userId: string) {
  return (await inbox(userId)).map((n) => n.type).sort();
}

async function setLevel(ctx: Ctx, userId: string, level: "all" | "results_mentions" | "none") {
  await getDb()
    .update(leagueMembers)
    .set({ notifyLevel: level })
    .where(and(eq(leagueMembers.leagueId, ctx.league.id), eq(leagueMembers.userId, userId)));
}

async function newBet(ctx: Ctx, creator: { id: string }, extra: Record<string, unknown> = {}) {
  const created = await createBet(
    creator,
    ctx.league.id,
    {
      question: "Qui paie la tournée ?",
      options: ["Oui", "Non"],
      moment: "NIGHT",
      closesAt: CLOSE.toISOString(),
      ...extra,
    },
    T0,
  );
  if (!created.ok) throw new Error(JSON.stringify(created));
  return { betId: created.betId, options: await optionIds(created.betId) };
}

async function stake(ctx: Ctx, user: { id: string }, betId: string, optionId: string, amount = 2) {
  const r = await placeWager(
    user,
    ctx.league.id,
    betId,
    { optionId, amount, ticketId: randomUUID() },
    at(1),
  );
  if (!r.ok) throw new Error(r.error);
}

describe("destinataires", () => {
  beforeEach(resetDb);

  it("nouveau pari : tous les membres actifs, sauf le créateur et les partis", async () => {
    const ctx = await leagueWith(3);
    const [p1, p2, p3] = [ctx.players[0]!, ctx.players[1]!, ctx.players[2]!];
    await leaveLeague(p3, ctx.league.id, T0);
    const bet = await newBet(ctx, p1);
    expect(await types(ctx.owner.id)).toEqual(["bet_opened"]);
    expect(await types(p2.id)).toEqual(["bet_opened"]);
    expect(await types(p1.id)).toEqual([]);
    expect(await types(p3.id)).toEqual([]);
    const [n] = await inbox(p2.id);
    expect(n!.payload).toEqual({
      type: "bet_opened",
      betId: bet.betId,
      question: "Qui paie la tournée ?",
      opensAt: null,
    });
  });

  it("résultat, correction, règlement : les parieurs seulement, jamais celui qui saisit", async () => {
    const ctx = await leagueWith(3);
    const [p1, p2, p3] = [ctx.players[0]!, ctx.players[1]!, ctx.players[2]!];
    const bet = await newBet(ctx, ctx.owner);
    await stake(ctx, p1, bet.betId, bet.options[0]!);
    await stake(ctx, p2, bet.betId, bet.options[1]!);
    await stake(ctx, ctx.owner, bet.betId, bet.options[1]!);
    await getDb().delete(notifications);

    await resolveBet(ctx.owner, ctx.league.id, bet.betId, { optionId: bet.options[0]! }, after(1));
    expect(await types(p1.id)).toEqual(["bet_resolved"]);
    expect(await types(p2.id)).toEqual(["bet_resolved"]);
    expect(await types(ctx.owner.id)).toEqual([]);
    expect(await types(p3.id)).toEqual([]);
    expect((await inbox(p1.id))[0]!.payload).toMatchObject({
      option: "Oui",
      delayMinutes: 10,
      correction: false,
    });

    await correctResult(
      ctx.owner,
      ctx.league.id,
      bet.betId,
      { optionId: bet.options[1]! },
      after(2),
    );
    expect(
      (await inbox(p1.id)).map((n) => (n.payload as { correction?: boolean }).correction),
    ).toEqual(expect.arrayContaining([false, true]));

    await settleDue(ctx.league.id, after(20));
    const settled = (userId: string) =>
      inbox(userId).then((rows) => rows.find((n) => n.type === "bet_settled")?.payload);
    expect(await settled(p1.id)).toMatchObject({ outcome: "lost", amount: 2 });
    expect(await settled(p2.id)).toMatchObject({ outcome: "won" });
    // Le règlement est automatique : l'owner parieur le reçoit aussi.
    expect(await settled(ctx.owner.id)).toMatchObject({ outcome: "won" });
    expect(await settled(p3.id)).toBeUndefined();
  });

  it("pari réglé sans perdant : mise rendue", async () => {
    const ctx = await leagueWith(1);
    const p1 = ctx.players[0]!;
    const bet = await newBet(ctx, ctx.owner);
    await stake(ctx, p1, bet.betId, bet.options[0]!, 3);
    await resolveBet(ctx.owner, ctx.league.id, bet.betId, { optionId: bet.options[0]! }, after(1));
    await settleDue(ctx.league.id, after(20));
    const row = (await inbox(p1.id)).find((n) => n.type === "bet_settled");
    expect(row!.payload).toMatchObject({ outcome: "refunded", amount: 3 });
  });

  it("annulation : les parieurs, sauf celui qui annule ; égalité et expiration aussi", async () => {
    const ctx = await leagueWith(2);
    const [p1, p2] = [ctx.players[0]!, ctx.players[1]!];
    const a = await newBet(ctx, ctx.owner);
    await stake(ctx, p1, a.betId, a.options[0]!, 4);
    await stake(ctx, ctx.owner, a.betId, a.options[1]!);
    await getDb().delete(notifications);
    await cancelBet(ctx.owner, ctx.league.id, a.betId, at(5));
    expect((await inbox(p1.id)).map((n) => n.payload)).toEqual([
      { type: "bet_cancelled", betId: a.betId, question: "Qui paie la tournée ?", amount: 4 },
    ]);
    expect(await types(ctx.owner.id)).toEqual([]);
    expect(await types(p2.id)).toEqual([]);

    const tie = await newBet(ctx, ctx.owner);
    await stake(ctx, p2, tie.betId, tie.options[0]!);
    await resolveBet(ctx.owner, ctx.league.id, tie.betId, { cancel: true }, after(1));
    expect(await types(p2.id)).toContain("bet_cancelled");

    const stale = await newBet(ctx, ctx.owner);
    await stake(ctx, p1, stale.betId, stale.options[0]!);
    await getDb().delete(notifications);
    await settleDue(ctx.league.id, new Date(CLOSE.getTime() + 7 * 24 * 3600_000));
    expect(await types(p1.id)).toEqual(["bet_cancelled"]);
  });

  it("mention : le membre mentionné, pas l'auteur qui se mentionne", async () => {
    const ctx = await leagueWith(2);
    const [p1, p2] = [ctx.players[0]!, ctx.players[1]!];
    await sendMessage(
      p1,
      ctx.league.id,
      { kind: "text", body: `Salut @${p2.name} et @${p1.name}` },
      T0,
    );
    expect((await inbox(p2.id)).map((n) => n.payload)).toEqual([
      expect.objectContaining({ type: "mention", author: p1.name }),
    ]);
    expect(await types(p1.id)).toEqual([]);
    expect(await types(ctx.owner.id)).toEqual([]);
  });

  it("tournée : tous les membres actifs, sauf l'owner", async () => {
    const ctx = await leagueWith(2);
    await offerRound(ctx.owner, ctx.league.id, { amount: 10, roundId: randomUUID() }, T0);
    expect(await types(ctx.players[0]!.id)).toEqual(["round"]);
    expect(await types(ctx.owner.id)).toEqual([]);
    expect((await inbox(ctx.players[1]!.id))[0]!.payload).toEqual({ type: "round", amount: 10 });
  });
});

describe("niveaux", () => {
  beforeEach(resetDb);

  it("« résultats et mentions » : ni nouveau pari ni tournée, mais résultats et mentions", async () => {
    const ctx = await leagueWith(2);
    const [p1, p2] = [ctx.players[0]!, ctx.players[1]!];
    await setLevel(ctx, p1.id, "results_mentions");
    const bet = await newBet(ctx, ctx.owner);
    await offerRound(ctx.owner, ctx.league.id, { amount: 10, roundId: randomUUID() }, T0);
    expect(await types(p1.id)).toEqual([]);
    await stake(ctx, p1, bet.betId, bet.options[0]!);
    await stake(ctx, p2, bet.betId, bet.options[1]!);
    await resolveBet(ctx.owner, ctx.league.id, bet.betId, { optionId: bet.options[0]! }, after(1));
    await sendMessage(p2, ctx.league.id, { kind: "text", body: `@${p1.name} bien joué` }, T0);
    expect(await types(p1.id)).toEqual(["bet_resolved", "mention"]);
  });

  it("« rien » : rien du tout", async () => {
    const ctx = await leagueWith(2);
    const [p1, p2] = [ctx.players[0]!, ctx.players[1]!];
    await setLevel(ctx, p1.id, "none");
    const bet = await newBet(ctx, ctx.owner);
    await stake(ctx, p1, bet.betId, bet.options[0]!);
    await stake(ctx, p2, bet.betId, bet.options[1]!);
    await resolveBet(ctx.owner, ctx.league.id, bet.betId, { optionId: bet.options[0]! }, after(1));
    await settleDue(ctx.league.id, after(20));
    await sendMessage(p2, ctx.league.id, { kind: "text", body: `@${p1.name}` }, T0);
    await offerRound(ctx.owner, ctx.league.id, { amount: 10, roundId: randomUUID() }, T0);
    expect(await types(p1.id)).toEqual([]);
  });
});

describe("fuites et transaction", () => {
  beforeEach(resetDb);

  it("un pari mystère programmé : ni question ni options", async () => {
    const ctx = await leagueWith(1);
    const bet = await newBet(ctx, ctx.owner, {
      question: "Secret absolu ?",
      options: ["Alpha", "Bravo"],
      opensAt: at(60).toISOString(),
      hiddenUntilOpen: true,
    });
    const [n] = await inbox(ctx.players[0]!.id);
    expect(n!.payload).toEqual({
      type: "bet_opened",
      betId: bet.betId,
      question: null,
      opensAt: at(60).toISOString(),
    });
    const json = JSON.stringify(n);
    for (const leak of ["Secret", "Alpha", "Bravo"]) expect(json).not.toContain(leak);
  });

  it("un pari programmé visible : la question et l'heure d'ouverture", async () => {
    const ctx = await leagueWith(1);
    await newBet(ctx, ctx.owner, { opensAt: at(60).toISOString() });
    expect((await inbox(ctx.players[0]!.id))[0]!.payload).toMatchObject({
      question: "Qui paie la tournée ?",
      opensAt: at(60).toISOString(),
    });
  });

  it("événement annulé : aucune notification", async () => {
    const ctx = await leagueWith(1);
    await expect(
      getDb().transaction(async (tx) => {
        await notify(tx, {
          kind: "round",
          leagueId: ctx.league.id,
          actorId: ctx.owner.id,
          amount: 5,
        });
        throw new Error("annulée");
      }),
    ).rejects.toThrow();
    expect(await inbox(ctx.players[0]!.id)).toEqual([]);
  });
});

describe("départ", () => {
  beforeEach(resetDb);

  it("quitter ou être exclu efface ses notifications de cette ligue, pas des autres", async () => {
    const a = await leagueWith(2);
    const b = await leagueWith(0);
    const [p1, p2] = [a.players[0]!, a.players[1]!];
    await joinLeague(p1, b.league.inviteCode, T0);
    await offerRound(a.owner, a.league.id, { amount: 10, roundId: randomUUID() }, T0);
    await offerRound(b.owner, b.league.id, { amount: 10, roundId: randomUUID() }, T0);
    expect(await inbox(p1.id)).toHaveLength(2);
    await leaveLeague(p1, a.league.id, T0);
    expect((await inbox(p1.id)).map((n) => n.leagueId)).toEqual([b.league.id]);
    await removeMember(a.owner, a.league.id, p2.id, T0);
    expect(await inbox(p2.id)).toEqual([]);
  });
});
