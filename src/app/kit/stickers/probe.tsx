"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

// Journal local des insertions dans une zone éditable et un textarea, pour voir
// ce qu'envoient les stickers de l'iPhone. Rien ne quitte le navigateur : les
// images blob: et data: sont relues avec fetch, qui ne touche pas le réseau.

type Target = "zone" | "textarea";

/** Raccourcit les URI data: et les textes longs, pour garder le journal lisible. */
function short(text: string, max = 300): string {
  const compact = text.replace(
    /(data:[^;,"')\s]*[;,][^,"')\s]*,?)([^"')\s]{40})[^"')\s]*/g,
    (_, head: string, start: string) => `${head}${start}…`,
  );
  return compact.length > max ? `${compact.slice(0, max)}… (${compact.length} car.)` : compact;
}

function describeTransfer(dt: DataTransfer | null): string[] {
  if (!dt) return ["  dataTransfer : aucun"];
  const lines = [`  types : ${dt.types.length ? dt.types.join(", ") : "aucun"}`];
  Array.from(dt.items).forEach((item, i) => {
    lines.push(`  item ${i} : ${item.kind} ${item.type || "(sans type)"}`);
  });
  Array.from(dt.files).forEach((file, i) => {
    lines.push(`  fichier ${i} : ${file.type || "(sans type)"}, ${file.size} o, « ${file.name} »`);
  });
  if (dt.files.length === 0) lines.push("  fichiers : aucun");
  const html = dt.getData("text/html");
  if (html) lines.push(`  text/html : ${short(html)}`);
  const plain = dt.getData("text/plain");
  if (plain) lines.push(`  text/plain : ${short(plain)}`);
  return lines;
}

function sourceKind(src: string): "blob" | "data" | "autre" {
  if (src.startsWith("blob:")) return "blob";
  if (src.startsWith("data:")) return "data";
  return "autre";
}

async function describeImage(img: HTMLImageElement): Promise<string[]> {
  const attribute = img.getAttribute("src") ?? "";
  const kind = sourceKind(img.src || attribute);
  try {
    await img.decode();
  } catch {
    // Image illisible : les dimensions restent à 0.
  }
  let mime = "inconnu";
  let weight = "inconnu";
  if (kind === "blob" || kind === "data") {
    try {
      const blob = await (await fetch(img.src)).blob();
      mime = blob.type || "(vide)";
      weight = `${blob.size} o`;
    } catch (error) {
      mime = `illisible (${String(error)})`;
    }
  } else {
    // Aucune requête de plus : seulement ce que le navigateur a déjà chargé.
    const entry = performance.getEntriesByName(img.src).at(-1) as
      PerformanceResourceTiming | undefined;
    if (entry) weight = `${entry.encodedBodySize} o transférés, ${entry.decodedBodySize} o décodés`;
  }
  return [
    `  source : ${kind} (${short(attribute, 120)})`,
    `  type MIME : ${mime}`,
    `  dimensions : ${img.naturalWidth}×${img.naturalHeight} (affichée ${img.width}×${img.height})`,
    `  poids : ${weight}`,
  ];
}

export function StickerProbe() {
  const zoneRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [log, setLog] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const zone = zoneRef.current;
    const area = areaRef.current;
    if (!zone || !area) return;
    const start = performance.now();
    const append = (target: Target, title: string, details: string[] = []) => {
      const time = Math.round(performance.now() - start);
      setLog((previous) => [
        ...previous,
        [`+${time} ms · ${target} · ${title}`, ...details].join("\n"),
      ]);
    };

    const cleanups: Array<() => void> = [];
    for (const [target, element] of [
      ["zone", zone],
      ["textarea", area],
    ] as Array<[Target, HTMLElement]>) {
      const onBeforeInput = (event: InputEvent) => {
        const details = [
          `  data : ${event.data === null ? "null" : short(JSON.stringify(event.data))}`,
        ];
        append(target, `beforeinput ${event.inputType}`, [
          ...details,
          ...describeTransfer(event.dataTransfer),
        ]);
      };
      const onInput = (event: Event) => {
        const input = event as InputEvent;
        const details = [
          `  data : ${input.data === null ? "null" : short(JSON.stringify(input.data))}`,
        ];
        if (target === "textarea") details.push(`  valeur : ${area.value.length} car.`);
        append(target, `input ${input.inputType ?? "(sans inputType)"}`, details);
      };
      const onPaste = (event: ClipboardEvent) => {
        append(target, "paste", describeTransfer(event.clipboardData));
      };
      element.addEventListener("beforeinput", onBeforeInput);
      element.addEventListener("input", onInput);
      element.addEventListener("paste", onPaste);
      cleanups.push(() => {
        element.removeEventListener("beforeinput", onBeforeInput);
        element.removeEventListener("input", onInput);
        element.removeEventListener("paste", onPaste);
      });
    }

    // Le HTML réellement inséré dans la zone, et chaque image qu'il apporte.
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            append("zone", `HTML inséré <${node.tagName.toLowerCase()}>`, [
              `  ${short(node.outerHTML, 600)}`,
            ]);
            const images =
              node instanceof HTMLImageElement ? [node] : Array.from(node.querySelectorAll("img"));
            images.forEach((img, i) => {
              void describeImage(img).then((details) => append("zone", `image ${i + 1}`, details));
            });
          } else if (node.nodeType === Node.TEXT_NODE) {
            append("zone", "texte inséré", [`  ${short(JSON.stringify(node.textContent ?? ""))}`]);
          }
        });
      }
    });
    observer.observe(zone, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  const text = log.join("\n\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("Journal copié.");
    } catch {
      // Repli : sélection d'un champ caché et commande de copie.
      const helper = document.createElement("textarea");
      helper.value = text;
      document.body.append(helper);
      helper.select();
      const ok = document.execCommand("copy");
      helper.remove();
      setCopied(ok ? "Journal copié." : "Copie impossible : sélectionne le journal à la main.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 id="zone-label" className="text-overline text-ink-subtle">
          Zone éditable
        </h2>
        <div
          ref={zoneRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline
          aria-labelledby="zone-label"
          className="min-h-32 overflow-auto rounded-md border border-line-strong bg-surface px-4 py-3 text-[15px] text-ink"
        />
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor="sticker-textarea" className="text-overline text-ink-subtle">
          Textarea
        </label>
        <textarea
          id="sticker-textarea"
          ref={areaRef}
          className="min-h-32 rounded-md border border-line-strong bg-surface px-4 py-3 text-[15px] text-ink"
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-overline text-ink-subtle">Journal · {log.length} entrées</h2>
        <Button variant="secondary" onClick={copy} disabled={log.length === 0}>
          Copier le journal
        </Button>
        {copied ? (
          <p role="status" className="text-caption text-ink-subtle">
            {copied}
          </p>
        ) : null}
        <pre className="text-caption overflow-x-auto font-mono break-all whitespace-pre-wrap text-ink-muted">
          {text || "Aucun événement pour l'instant."}
        </pre>
      </section>
    </div>
  );
}
