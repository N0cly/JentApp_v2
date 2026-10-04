"use client";

// Page provisoire, à supprimer. Tout reste dans le navigateur : rien n'est
// envoyé au serveur. Seules les images blob: et data: sont lues (fetch local).

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

type Field = "zone" | "textarea";

/** Les data: URI sont longues : on n'en garde que le début dans le journal. */
const DATA_PREVIEW = 80;

function shorten(html: string): string {
  return html.replace(/data:[^"')\s]+/g, (uri) =>
    uri.length > DATA_PREVIEW ? `${uri.slice(0, DATA_PREVIEW)}… (${uri.length} caractères)` : uri,
  );
}

function stamp(): string {
  const d = new Date();
  return `${d.toLocaleTimeString("fr-FR")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function describeTransfer(dt: DataTransfer | null): string[] {
  if (!dt) return ["  dataTransfer absent"];
  const lines = [`  types = ${JSON.stringify([...dt.types])}`];
  const items = [...dt.items];
  items.forEach((item, i) => {
    lines.push(`  item ${i} · kind=${item.kind} · type=${item.type || "(vide)"}`);
  });
  const files = [...dt.files];
  if (files.length === 0) lines.push("  aucun fichier");
  files.forEach((file, i) => {
    lines.push(
      `  fichier ${i} · nom=${file.name || "(vide)"} · type=${file.type || "(vide)"} · ${file.size} octets`,
    );
  });
  if (dt.types.includes("text/html")) {
    lines.push(`  text/html = ${shorten(dt.getData("text/html"))}`);
  }
  return lines;
}

function sourceKind(src: string): "blob" | "data" | "autre" {
  if (src.startsWith("blob:")) return "blob";
  if (src.startsWith("data:")) return "data";
  return "autre";
}

async function describeImage(img: HTMLImageElement): Promise<string> {
  const src = img.getAttribute("src") ?? "";
  const kind = sourceKind(src);
  let mime = "inconnu";
  let weight = "inconnu";
  if (kind !== "autre") {
    try {
      const blob = await (await fetch(src)).blob();
      mime = blob.type || "(vide)";
      weight = `${blob.size} octets`;
    } catch (error) {
      mime = weight = `illisible (${String(error)})`;
    }
  } else {
    mime = weight = "non lu, source distante";
  }
  let size = "inconnues";
  try {
    await img.decode();
    size = `${img.naturalWidth}×${img.naturalHeight}`;
  } catch {
    size = "image non décodée";
  }
  return `  image · source=${kind} · type=${mime} · dimensions=${size} · poids=${weight} · src=${shorten(src)}`;
}

export function StickerProbe() {
  const zoneRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const log = (entry: string[]) => setLines((current) => [...current, ...entry]);

    const listen = (field: Field, el: HTMLElement) => {
      const onInputEvent = (event: Event) => {
        const e = event as InputEvent;
        const entry = [
          `${stamp()} ${field} · ${e.type} · inputType=${e.inputType || "(vide)"} · data=${JSON.stringify(e.data)}`,
        ];
        if (e.dataTransfer) entry.push(...describeTransfer(e.dataTransfer));
        log(entry);
      };
      const onPaste = (event: Event) => {
        const e = event as ClipboardEvent;
        log([`${stamp()} ${field} · paste`, ...describeTransfer(e.clipboardData)]);
      };
      el.addEventListener("beforeinput", onInputEvent);
      el.addEventListener("input", onInputEvent);
      el.addEventListener("paste", onPaste);
      return () => {
        el.removeEventListener("beforeinput", onInputEvent);
        el.removeEventListener("input", onInputEvent);
        el.removeEventListener("paste", onPaste);
      };
    };

    const zone = zoneRef.current!;
    const area = areaRef.current!;
    const stopZone = listen("zone", zone);
    const stopArea = listen("textarea", area);

    // HTML inséré dans la zone, et chaque image qu'il contient.
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            log([`${stamp()} zone · texte inséré = ${JSON.stringify(node.textContent)}`]);
            continue;
          }
          if (!(node instanceof Element)) continue;
          log([`${stamp()} zone · HTML inséré = ${shorten(node.outerHTML)}`]);
          const images =
            node instanceof HTMLImageElement ? [node] : [...node.querySelectorAll("img")];
          for (const img of images) {
            void describeImage(img).then((line) => log([`${stamp()} zone · image insérée`, line]));
          }
        }
      }
    });
    observer.observe(zone, { childList: true, subtree: true });

    return () => {
      stopZone();
      stopArea();
      observer.disconnect();
    };
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText([`${navigator.userAgent}`, "", ...lines].join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="flex grow flex-col gap-4 px-5 pt-2 pb-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-caption text-ink-subtle">contenteditable</span>
          <div
            ref={zoneRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            className="text-body min-h-[160px] overflow-auto rounded-md border border-line-strong bg-surface-raised p-3 [&_img]:max-w-full"
          />
        </div>
        <label className="flex min-w-0 flex-col gap-2">
          <span className="text-caption text-ink-subtle">textarea</span>
          <textarea
            ref={areaRef}
            className="text-body min-h-[160px] resize-y rounded-md border border-line-strong bg-surface-raised p-3"
          />
        </label>
      </div>
      <Button variant="secondary" onClick={copy} disabled={lines.length === 0}>
        {copied ? "Copié" : "Copier le journal"}
      </Button>
      <pre className="min-h-[120px] overflow-auto rounded-md bg-surface p-3 font-mono text-[12px] leading-4 whitespace-pre-wrap text-ink-muted [overflow-wrap:anywhere]">
        {lines.length === 0 ? "Journal vide." : lines.join("\n")}
      </pre>
    </main>
  );
}
