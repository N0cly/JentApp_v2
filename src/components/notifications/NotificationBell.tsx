"use client";

import { useState } from "react";
import { useLiveEvents } from "@/components/live/LiveProvider";
import { BellIcon, IconButton } from "@/components/ui";

/** Cloche de l'en-tête : un point tant qu'il reste du non-lu, posé en direct. */
export function NotificationBell({ leagueId, unread }: { leagueId: string; unread: boolean }) {
  const [arrived, setArrived] = useState(false);
  useLiveEvents(["notification.new"], (event) => {
    if (event.type === "notification.new") setArrived(true);
  });
  const dot = unread || arrived;
  return (
    <span className="relative flex">
      <IconButton
        label={dot ? "Notifications, non lues" : "Notifications"}
        variant="outlined"
        href={`/notifications?ligue=${leagueId}`}
      >
        <BellIcon size={20} />
      </IconButton>
      {dot && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-[9px] right-[10px] size-[8px] rounded-full bg-loss"
        />
      )}
    </span>
  );
}
