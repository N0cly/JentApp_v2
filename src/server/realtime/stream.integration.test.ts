import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/server/errors";
import { removeMember } from "@/server/leagues";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import { stopListening, subscribersOf } from "./hub";
import { openStream } from "./stream";

async function waitFor(check: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
  return true;
}

/** Lit un flux en tâche de fond ; `done` passe à vrai quand il se ferme. */
function drain(stream: ReadableStream<Uint8Array>) {
  const state = { text: "", done: false };
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      state.text += decoder.decode(value);
    }
    state.done = true;
  })();
  return state;
}

describe("flux", () => {
  afterAll(async () => {
    await stopListening();
  });
  beforeEach(resetDb);

  it("refusé à un non-membre (404)", async () => {
    const { league } = await leagueWith(0);
    const other = await leagueWith(0);
    await expect(
      openStream(other.owner.id, league.id, new AbortController().signal),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("le flux d'un membre exclu se ferme", async () => {
    const { league, owner, players } = await leagueWith(1);
    const abort = new AbortController();
    const { stream } = await openStream(players[0]!.id, league.id, abort.signal);
    const state = drain(stream);
    await removeMember(owner, league.id, players[0]!.id, new Date());
    expect(await waitFor(() => state.done)).toBe(true);
    expect(state.text).toContain("event: member.changed");
  });

  it("quatrième flux : le premier est fermé", async () => {
    const { league, owner } = await leagueWith(0);
    const signal = new AbortController().signal;
    const states: ReturnType<typeof drain>[] = [];
    for (let i = 0; i < 4; i++) {
      const { stream } = await openStream(owner.id, league.id, signal);
      states.push(drain(stream));
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(await waitFor(() => states[0]!.done)).toBe(true);
    expect(states.slice(1).map((s) => s.done)).toEqual([false, false, false]);
    expect(subscribersOf(league.id)).toHaveLength(3);
    for (const sub of subscribersOf(league.id)) sub.close();
  });

  it("la fermeture côté client retire l'abonné", async () => {
    const { league, owner } = await leagueWith(0);
    const abort = new AbortController();
    await openStream(owner.id, league.id, abort.signal);
    expect(subscribersOf(league.id)).toHaveLength(1);
    abort.abort();
    expect(subscribersOf(league.id)).toHaveLength(0);
  });
});
