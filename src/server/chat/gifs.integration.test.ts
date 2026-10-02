import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/test/db";
import { createUser } from "@/test/factories";
import { searchGifs } from "./gifs";
import { sendMessage } from "./messages";
import { leagueWith } from "@/test/bets";

const KEY = "cle-giphy-de-test-123456";
const now = new Date("2026-10-07T18:00:00Z");

function fakeGiphy(data: unknown[]) {
  const calls: URL[] = [];
  const fetcher = (async (input: URL | string) => {
    calls.push(new URL(String(input)));
    return new Response(JSON.stringify({ data, pagination: {}, meta: {} }), { status: 200 });
  }) as typeof fetch;
  return { fetcher, calls };
}

const item = (id: string, url: string) => ({
  id,
  images: {
    fixed_width: { url, width: "200", height: "150" },
    fixed_width_downsampled: { url: url.replace(".gif", "_d.gif"), width: "200", height: "150" },
  },
});

describe("GIF", () => {
  beforeEach(async () => {
    await resetDb();
    vi.stubEnv("GIPHY_API_KEY", KEY);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("appelle Giphy avec 24 résultats, lang=fr, rating=r ; la clé n'apparaît pas dans la réponse", async () => {
    const user = await createUser();
    const { fetcher, calls } = fakeGiphy([
      item("a", `https://media1.giphy.com/media/a/200w.gif?cid=x&api_key=${KEY}`),
      item("b", "http://media2.giphy.com/media/b/200w.gif"),
      item("c", "https://evil.example/c.gif"),
    ]);
    const result = await searchGifs(user.id, "  soirée  ", now, fetcher);
    expect(calls[0]?.pathname).toBe("/v1/gifs/search");
    expect(Object.fromEntries(calls[0]!.searchParams)).toEqual({
      api_key: KEY,
      q: "soirée",
      limit: "24",
      lang: "fr",
      rating: "r",
    });
    expect(result).toEqual({
      ok: true,
      gifs: [
        {
          id: "a",
          url: "https://media1.giphy.com/media/a/200w.gif",
          width: 200,
          height: 150,
          preview: "https://media1.giphy.com/media/a/200w_d.gif",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("sans recherche : rien, sans appeler Giphy ; sans clé : 503", async () => {
    const user = await createUser();
    const { fetcher, calls } = fakeGiphy([]);
    expect(await searchGifs(user.id, "", now, fetcher)).toEqual({ ok: true, gifs: [] });
    expect(calls).toHaveLength(0);
    vi.stubEnv("GIPHY_API_KEY", "");
    expect(await searchGifs(user.id, "chat", now, fetcher)).toMatchObject({
      ok: false,
      status: 503,
    });
  });

  it("Giphy en panne : le message de M4 ; 30 recherches par minute", async () => {
    const user = await createUser();
    const down = (async () => new Response("oops", { status: 500 })) as typeof fetch;
    expect(await searchGifs(user.id, "chat", now, down)).toEqual({
      ok: false,
      status: 502,
      error: "Les GIF ne répondent pas. Réessaie plus tard.",
    });
    const { fetcher } = fakeGiphy([]);
    for (let i = 0; i < 29; i++) await searchGifs(user.id, "chat", now, fetcher);
    expect(await searchGifs(user.id, "chat", now, fetcher)).toMatchObject({
      ok: false,
      status: 429,
    });
  });

  it("à l'envoi, une URL hors https *.giphy.com est refusée", async () => {
    const { league, owner } = await leagueWith(0);
    for (const gifUrl of [
      "http://media.giphy.com/media/x/200w.gif",
      "https://giphy.com.evil.example/x.gif",
      "https://evil.example/media.giphy.com/x.gif",
      "javascript:alert(1)",
    ]) {
      expect(await sendMessage(owner, league.id, { kind: "gif", gifUrl }, now)).toEqual({
        ok: false,
        error: "Ce GIF ne vient pas de Giphy.",
      });
    }
    expect(
      (
        await sendMessage(
          owner,
          league.id,
          {
            kind: "gif",
            gifUrl: "https://media.giphy.com/media/x/200w.gif",
            width: 200,
            height: 150,
          },
          now,
        )
      ).ok,
    ).toBe(true);
  });
});
