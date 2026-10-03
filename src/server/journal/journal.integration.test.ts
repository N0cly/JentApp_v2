import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteAccount } from "@/server/account/delete";
import {
  cancelBet,
  correctResult,
  createBet,
  placeWager,
  resolveBet,
  settleDue,
} from "@/server/bets";
import {
  changeRole,
  offerRound,
  regenerateInviteCode,
  removeMember,
  renameLeague,
  transferLeague,
  updateEconomy,
} from "@/server/leagues";
import { at, CLOSE, T0 } from "@/test/bet-scenarios";
import { leagueWith, optionIds } from "@/test/bets";
import { resetDb } from "@/test/db";
import { readJournal } from "./journal";

const after = (minutes: number) => new Date(CLOSE.getTime() + minutes * 60_000);

describe("journal", () => {
  beforeEach(resetDb);

  it("chaque action a sa phrase, lisible par un simple joueur", async () => {
    const ctx = await leagueWith(3);
    const [p1, p2, p3] = [ctx.players[0]!, ctx.players[1]!, ctx.players[2]!];
    const id = ctx.league.id;
    const o = ctx.owner;
    const mk = async (question: string, extra: Record<string, unknown> = {}) => {
      const r = await createBet(
        o,
        id,
        {
          question,
          options: ["Oui", "Non"],
          moment: "NIGHT",
          closesAt: CLOSE.toISOString(),
          ...extra,
        },
        T0,
      );
      if (!r.ok) throw new Error(JSON.stringify(r));
      return { betId: r.betId, options: await optionIds(r.betId) };
    };
    const a = await mk("Qui paie ?");
    await placeWager(
      p1,
      id,
      a.betId,
      { optionId: a.options[0]!, amount: 1, ticketId: randomUUID() },
      at(1),
    );
    await resolveBet(o, id, a.betId, { optionId: a.options[0]! }, after(1));
    await correctResult(o, id, a.betId, { optionId: a.options[1]! }, after(2));
    const b = await mk("Qui dort ?");
    await cancelBet(o, id, b.betId, at(3));
    const c = await mk("Qui chante ?");
    await placeWager(
      p1,
      id,
      c.betId,
      { optionId: c.options[0]!, amount: 1, ticketId: randomUUID() },
      at(1),
    );
    await resolveBet(o, id, c.betId, { cancel: true }, after(3));
    await mk("Qui gagne ?");
    await mk("Secret ?", {
      opensAt: at(600).toISOString(),
      closesAt: at(700).toISOString(),
      hiddenUntilOpen: true,
    });
    await offerRound(o, id, { amount: 10, roundId: randomUUID() }, T0);
    await updateEconomy(o, id, "seedAmount", 3);
    await renameLeague(o, id, "La Bande");
    await changeRole(o, id, p1.id, "admin");
    await changeRole(o, id, p1.id, "player");
    await removeMember(o, id, p3.id, T0);
    await regenerateInviteCode(o, id);
    await transferLeague(o, id, p2.id);
    // « Qui gagne ? » expire au bout de 7 jours sans résultat.
    await settleDue(id, new Date(CLOSE.getTime() + 7 * 24 * 3600_000));

    const { items } = await readJournal(p1, id, 0, after(5));
    const lines = items.map((e) =>
      (e.actor ? `${e.actor} ${e.text}` : e.text).replace(/\u00a0/g, " "),
    );
    const owner = o.name!;
    expect(lines).toEqual(
      expect.arrayContaining([
        `${owner} a créé le pari « Qui paie ? »`,
        `${owner} a saisi le résultat de « Qui paie ? » : Oui`,
        `${owner} a corrigé le résultat de « Qui paie ? » : Non`,
        `${owner} a annulé le pari « Qui dort ? »`,
        `${owner} a annulé le pari « Qui chante ? » : égalité`,
        `Le pari « Qui gagne ? » est annulé, sans résultat depuis 7 jours`,
        `${owner} a créé un pari mystère`,
        `${owner} a offert une tournée générale : +10 pour tous`,
        `${owner} a passé la cagnotte par pari de 5 à 3`,
        `${owner} a renommé la ligue en « La Bande »`,
        `${owner} a nommé ${p1.name} admin`,
        `${owner} a retiré le rôle d'admin à ${p1.name}`,
        `${owner} a exclu ${p3.name}`,
        `${owner} a régénéré le code d'invitation`,
        `${owner} a transmis la ligue à ${p2.name}`,
      ]),
    );
    expect(JSON.stringify(items)).not.toContain("Secret");
    // Le plus récent d'abord.
    const dates = items.map((e) => e.createdAt.getTime());
    expect(dates).toEqual([...dates].sort((x, y) => y - x));
  });

  it("non-membre : 404", async () => {
    const ctx = await leagueWith(0);
    const other = await leagueWith(0);
    await expect(readJournal(other.owner, ctx.league.id, 0, T0)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("auteur supprimé : « Joueur supprimé »", async () => {
    const ctx = await leagueWith(1);
    const p = ctx.players[0]!;
    const r = await createBet(
      p,
      ctx.league.id,
      { question: "Qui ?", options: ["A", "B"], moment: "NIGHT", closesAt: CLOSE.toISOString() },
      T0,
    );
    if (!r.ok) throw new Error("pari");
    await deleteAccount({ id: p.id, username: p.name!, email: p.email }, p.name, T0);
    const { items } = await readJournal(ctx.owner, ctx.league.id, 0, T0);
    expect(items.find((e) => e.text.startsWith("a créé le pari « Qui"))?.actor).toBe(
      "Joueur supprimé",
    );
  });

  it("pages de 50, sans doublon", async () => {
    const ctx = await leagueWith(0);
    for (let i = 0; i < 53; i++) await regenerateInviteCode(ctx.owner, ctx.league.id);
    const first = await readJournal(ctx.owner, ctx.league.id, 0, T0);
    const second = await readJournal(ctx.owner, ctx.league.id, 1, T0);
    expect(first.items).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(second.items).toHaveLength(3);
    expect(new Set([...first.items, ...second.items].map((e) => e.id)).size).toBe(53);
  });
});
