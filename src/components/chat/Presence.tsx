"use client";

import { useLive } from "@/components/live/LiveProvider";

/** « 4 en ligne » (chat.html). */
export function Presence() {
  const { online } = useLive();
  if (online.length === 0) return null;
  return (
    <span className="flex items-center gap-1 text-[13px] leading-[18px] font-semibold text-ink-muted">
      <span aria-hidden="true" className="size-[8px] rounded-full bg-win" />
      {online.length} en ligne
    </span>
  );
}
