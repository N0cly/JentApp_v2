import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { leagueWith } from "@/test/bets";
import { resetDb } from "@/test/db";
import {
  addSubscriber,
  removeSubscriber,
  stopListening,
  type ServerEvent,
  type Subscriber,
} from "./hub";
import { broadcastTyping, onlineIn } from "./presence";
import { openStream } from "./stream";

describe("présence", () => {
  afterAll(async () => {
    await stopListening();
  });
  beforeEach(resetDb);

  it("deux flux d'un même joueur comptent pour un ; la fermeture du dernier le retire", async () => {
    const { league, owner, players } = await leagueWith(1);
    const first = new AbortController();
    const second = new AbortController();
    const other = new AbortController();
    await openStream(owner.id, league.id, first.signal);
    await openStream(owner.id, league.id, second.signal);
    await openStream(players[0]!.id, league.id, other.signal);
    expect(onlineIn(league.id)).toEqual([owner.id, players[0]!.id].sort());
    first.abort();
    expect(onlineIn(league.id)).toContain(owner.id);
    second.abort();
    expect(onlineIn(league.id)).toEqual([players[0]!.id]);
    other.abort();
    expect(onlineIn(league.id)).toEqual([]);
  });

  it("la présence est diffusée à l'ouverture et à la fermeture", async () => {
    const { league, owner, players } = await leagueWith(1);
    const events: ServerEvent[] = [];
    const watcher: Subscriber = {
      leagueId: league.id,
      userId: owner.id,
      openedAt: 0,
      send: (e) => events.push(e),
      close: () => {},
    };
    addSubscriber(watcher);
    const abort = new AbortController();
    await openStream(players[0]!.id, league.id, abort.signal);
    abort.abort();
    const presence = events
      .filter((e) => e.type === "presence")
      .map((e) => ("online" in e ? e.online.length : -1));
    expect(presence).toEqual([2, 1]);
    removeSubscriber(watcher);
  });
});

describe("« écrit… »", () => {
  it("atteint toute la ligue sauf l'auteur, au plus une fois toutes les 3 secondes", () => {
    const league = "00000000-0000-4000-8000-0000000000aa";
    const got = { author: 0, other: 0 };
    const sub = (userId: string, key: keyof typeof got): Subscriber => ({
      leagueId: league,
      userId,
      openedAt: 0,
      send: (e) => {
        if (e.type === "typing") got[key] += 1;
      },
      close: () => {},
    });
    const a = sub("author", "author");
    const b = sub("other", "other");
    addSubscriber(a);
    addSubscriber(b);
    expect(broadcastTyping(league, "author", "Auteur", 10_000)).toBe(true);
    expect(broadcastTyping(league, "author", "Auteur", 11_000)).toBe(false);
    expect(broadcastTyping(league, "author", "Auteur", 13_100)).toBe(true);
    expect(got).toEqual({ author: 0, other: 2 });
    removeSubscriber(a);
    removeSubscriber(b);
  });
});
