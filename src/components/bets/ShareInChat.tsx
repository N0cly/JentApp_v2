"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { shareBetAction } from "@/app/(app)/l/[ligue]/chat-actions";
import { IconButton, ShareIcon } from "@/components/ui";

/** « Partager dans le chat » (pari-ouvert.html) : partage le pari, puis ouvre le chat. */
export function ShareInChat({ leagueId, betId }: { leagueId: string; betId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <IconButton
      label="Partager dans le chat"
      className="text-ink"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await shareBetAction(leagueId, betId, "");
          if (!result.error) router.push(`/l/${leagueId}/chat`);
        })
      }
    >
      <ShareIcon size={20} />
    </IconButton>
  );
}
