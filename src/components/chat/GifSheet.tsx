"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { BottomSheet, SearchIcon } from "@/components/ui";

export type GifChoice = { id: string; url: string; width: number; height: number; preview: string };

/** Choisir un GIF (gif.html). Pas de tendances : on cherche (docs/M4.md, choix 9). */
export function GifSheet({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (gif: GifChoice) => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ gifs: GifChoice[]; error?: string; query: string } | null>(
    null,
  );

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/gifs?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as { gifs?: GifChoice[]; error?: string };
        setResult({ gifs: body.gifs ?? [], error: response.ok ? undefined : body.error, query: q });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResult({ gifs: [], error: "Les GIF ne répondent pas. Réessaie plus tard.", query: q });
        }
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const shown = query.trim() && result?.query === query.trim() ? result : null;

  return (
    <BottomSheet open onClose={onClose} title="GIF">
      <div className="flex h-[52px] items-center gap-2 rounded-md border border-line-strong bg-surface px-4">
        <span className="flex text-ink-subtle">
          <SearchIcon size={18} />
        </span>
        <label htmlFor="gif-search" className="sr-only">
          Chercher un GIF
        </label>
        <input
          id="gif-search"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-[44px] min-w-0 grow bg-transparent text-[15px] text-ink"
        />
      </div>
      {!query.trim() && <p className="text-body text-ink-muted">Cherche un GIF.</p>}
      {shown?.error && <p className="text-body text-ink-muted">{shown.error}</p>}
      {shown && !shown.error && shown.gifs.length === 0 && (
        <p className="text-body text-ink-muted">Aucun GIF pour cette recherche.</p>
      )}
      {shown && shown.gifs.length > 0 && (
        <div className="grid max-h-[50dvh] grid-cols-2 gap-2 overflow-y-auto">
          {shown.gifs.map((gif) => (
            <button
              key={gif.id}
              type="button"
              aria-label="Choisir ce GIF"
              onClick={() => onPick(gif)}
              className="h-[96px] overflow-hidden rounded-md bg-surface"
            >
              <Image
                src={gif.preview}
                alt=""
                width={gif.width}
                height={gif.height}
                unoptimized
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
      <p className="text-caption text-ink-subtle">Résultats fournis par Giphy.</p>
    </BottomSheet>
  );
}
