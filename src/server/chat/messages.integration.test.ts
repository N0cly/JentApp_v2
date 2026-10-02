import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { messageMentions, messages, users } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { leaveLeague } from "@/server/leagues";
import { leagueWith, makeAdmin } from "@/test/bets";
import { resetDb } from "@/test/db";
import { deleteMessage, readMessages, sendMessage, toggleLike } from "./messages";

const now = new Date("2026-10-07T18:00:00Z");
const text = (body: string) => ({ kind: "text" as const, body });

async function send(user: { id: string }, leagueId: string, body: string, at = now) {
  const result = await sendMessage(user, leagueId, text(body), at);
  if (!result.ok) throw new Error(result.error);
  return result.id;
}

describe("messages", () => {
  beforeEach(resetDb);

  it("longueur : 1 à 500 caractères après nettoyage, sauts de ligne gardés", async () => {
    const { league, owner } = await leagueWith(0);
    expect(await sendMessage(owner, league.id, text("   \n  "), now)).toEqual({
      ok: false,
      error: "Écris quelque chose avant d'envoyer.",
    });
    expect(await sendMessage(owner, league.id, text("x".repeat(503)), now)).toEqual({
      ok: false,
      error: "500 caractères au plus. Il y en a 3 de trop.",
    });
    expect((await sendMessage(owner, league.id, text(`  ${"x".repeat(500)}   `), now)).ok).toBe(
      true,
    );
    await send(owner, league.id, "  Salut   la\r\n\n\n\nbande  ");
    const [, last] = await readMessages(owner, league.id);
    expect(last?.body).toBe("Salut la\n\nbande");
  });

  it("un non-membre reçoit une 404, en écriture comme en lecture", async () => {
    const { league } = await leagueWith(0);
    const other = await leagueWith(0);
    await expect(sendMessage(other.owner, league.id, text("coucou"), now)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(readMessages(other.owner, league.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("30 messages par minute et par compte", async () => {
    const { league, owner } = await leagueWith(0);
    for (let i = 0; i < 30; i++) await send(owner, league.id, `m${i}`);
    expect(await sendMessage(owner, league.id, text("un de trop"), now)).toEqual({
      ok: false,
      error: "Doucement. Réessaie dans un instant.",
    });
    expect(
      (await sendMessage(owner, league.id, text("plus tard"), new Date(now.getTime() + 61_000))).ok,
    ).toBe(true);
  });

  it("pages de 50 dans l'ordre, sans doublon ni trou ; after reprend après un identifiant", async () => {
    const { league, owner, players } = await leagueWith(1);
    const ids: number[] = [];
    for (let i = 0; i < 120; i++) {
      const at = new Date(now.getTime() + Math.floor(i / 25) * 61_000);
      ids.push(await send(i % 2 ? owner : players[0]!, league.id, `message ${i}`, at));
    }
    const last = await readMessages(owner, league.id);
    const middle = await readMessages(owner, league.id, { before: last[0]!.id });
    const first = await readMessages(owner, league.id, { before: middle[0]!.id });
    expect([last.length, middle.length, first.length]).toEqual([50, 50, 20]);
    expect([...first, ...middle, ...last].map((m) => m.id)).toEqual(ids);
    expect((await readMessages(owner, league.id, { after: ids[99]! })).map((m) => m.id)).toEqual(
      ids.slice(100),
    );
  });

  it("suppression : les siens ; un admin ou l'owner, ceux des autres ; elle ne laisse pas de trace", async () => {
    const { league, owner, players } = await leagueWith(2);
    const [p1, p2] = [players[0]!, players[1]!];
    await makeAdmin(league.id, owner.id, p2.id);
    const a = await send(p1, league.id, "à moi");
    const b = await send(owner, league.id, "de l'owner");
    await expect(deleteMessage(p1, league.id, b, now)).rejects.toBeInstanceOf(NotFoundError);
    await deleteMessage(p1, league.id, a, now);
    await deleteMessage(p2, league.id, b, now);
    expect(await readMessages(owner, league.id)).toEqual([]);
    const rows = await getDb().select().from(messages);
    expect(rows.every((r) => r.body === null && r.deletedAt !== null)).toBe(true);
  });

  it("un message automatique ne se supprime pas", async () => {
    const { league, owner } = await leagueWith(0);
    const [row] = await getDb()
      .insert(messages)
      .values({ leagueId: league.id, kind: "system", event: "member_joined", data: {} })
      .returning();
    await expect(deleteMessage(owner, league.id, row!.id, now)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("« j'aime » : un par joueur, le second appui retire", async () => {
    const { league, owner, players } = await leagueWith(1);
    const id = await send(owner, league.id, "aime-moi");
    expect(await toggleLike(players[0]!, league.id, id)).toEqual({ liked: true });
    expect(await toggleLike(owner, league.id, id)).toEqual({ liked: true });
    let [view] = await readMessages(players[0]!, league.id);
    expect(view).toMatchObject({ likes: 2, likedByMe: true });
    expect(await toggleLike(players[0]!, league.id, id)).toEqual({ liked: false });
    [view] = await readMessages(players[0]!, league.id);
    expect(view).toMatchObject({ likes: 1, likedByMe: false });
  });
});

describe("mentions", () => {
  beforeEach(resetDb);

  it("seuls les membres actifs sont retenus, casse ignorée", async () => {
    const { league, owner, players } = await leagueWith(2);
    const [here, gone] = [players[0]!, players[1]!];
    await leaveLeague(gone, league.id, now);
    const outsider = (await leagueWith(0)).owner;
    const name = async (id: string) =>
      (await getDb().select().from(users).where(eq(users.id, id)))[0]!.name!;
    const body = `Salut @${(await name(here.id)).toUpperCase()} et @${await name(gone.id)} et @${await name(outsider.id)} et @Inconnu`;
    const id = await send(owner, league.id, body);
    const rows = await getDb()
      .select()
      .from(messageMentions)
      .where(eq(messageMentions.messageId, id));
    expect(rows.map((r) => r.userId)).toEqual([here.id]);
    const [view] = await readMessages(owner, league.id);
    expect(view?.mentions).toEqual([await name(here.id)]);
  });
});

describe("fuites", () => {
  beforeEach(resetDb);

  it("aucune réponse ne contient d'email", async () => {
    const { league, owner, players } = await leagueWith(1);
    await send(owner, league.id, "Coucou");
    const emails = (await getDb().select({ email: users.email }).from(users)).map((u) => u.email);
    const text = JSON.stringify(await readMessages(players[0]!, league.id));
    for (const email of emails) expect(text).not.toContain(email);
  });
});
