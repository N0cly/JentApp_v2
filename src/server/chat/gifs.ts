import { consume, RateLimitedError, rules } from "@/server/rate-limit";
import { isGiphyUrl } from "./rules";

// Recherche de GIF côté serveur : la clé Giphy ne sort jamais dans une réponse.
// Pas de tendances : Giphy exige que cet appel parte du navigateur (docs/M4.md, choix 9).

const ENDPOINT = "https://api.giphy.com/v1/gifs/search";
const LIMIT = 24;

export const gifMessages = { down: "Les GIF ne répondent pas. Réessaie plus tard." } as const;

export type Gif = { id: string; url: string; width: number; height: number; preview: string };

export type GifSearch =
  { ok: true; gifs: Gif[] } | { ok: false; status: 429 | 502 | 503; error: string };

type Rendition = { url?: string; width?: string; height?: string };
type GiphyResponse = {
  data?: {
    id?: string;
    images?: { fixed_width?: Rendition; fixed_width_downsampled?: Rendition };
  }[];
};

export function gifsEnabled(): boolean {
  return Boolean(process.env.GIPHY_API_KEY);
}

/** URL d'un média Giphy, sans paramètres (rien d'autre que l'image ne doit passer). */
function clean(url: string | undefined): string | null {
  if (!url || !isGiphyUrl(url)) return null;
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}

export async function searchGifs(
  userId: string,
  query: string | null,
  now: Date,
  fetcher: typeof fetch = fetch,
): Promise<GifSearch> {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return { ok: false, status: 503, error: gifMessages.down };
  const q = (query ?? "").trim().slice(0, 50);
  if (!q) return { ok: true, gifs: [] };

  try {
    await consume(rules.gifSearch, userId, now);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { ok: false, status: 429, error: "Doucement. Réessaie dans un instant." };
    }
    throw error;
  }

  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    api_key: key,
    q,
    limit: String(LIMIT),
    lang: "fr",
    rating: "r",
  }).toString();
  let body: GiphyResponse;
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { ok: false, status: 502, error: gifMessages.down };
    body = (await response.json()) as GiphyResponse;
  } catch {
    return { ok: false, status: 502, error: gifMessages.down };
  }

  const gifs: Gif[] = [];
  for (const item of body.data ?? []) {
    const full = item.images?.fixed_width;
    const src = clean(full?.url);
    if (!item.id || !src) continue;
    gifs.push({
      id: item.id,
      url: src,
      width: Number(full?.width) || 200,
      height: Number(full?.height) || 200,
      preview: clean(item.images?.fixed_width_downsampled?.url) ?? src,
    });
  }
  return { ok: true, gifs };
}
