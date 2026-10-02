"use client";

import { useState } from "react";
import { Button, CopyIcon } from "@/components/ui";

/** « Partager le lien » (avec ?par=pseudo) et « Copier le code ». */
export function ShareInvite({
  link,
  code,
  leagueName,
}: {
  link: string;
  code: string;
  leagueName: string;
}) {
  const [copied, setCopied] = useState<"lien" | "code" | null>(null);

  async function copy(text: string, what: "lien" | "code") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied(null);
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Rejoins ${leagueName} sur JentApp`, url: link });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copy(link, "lien");
  }

  return (
    <>
      <Button onClick={share}>{copied === "lien" ? "Lien copié" : "Partager le lien"}</Button>
      <Button variant="secondary" onClick={() => copy(code, "code")}>
        <CopyIcon size={18} />
        {copied === "code" ? "Code copié" : "Copier le code"}
      </Button>
    </>
  );
}
