"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { TabBar, type Tab } from "@/components/ui";

const tabs: Tab[] = ["paris", "classement", "chat", "moi"];

/** Barre d'onglets de la ligue, avec l'onglet actif tiré de l'URL. */
export function LeagueTabs({ leagueId }: { leagueId: string }) {
  const segment = useSelectedLayoutSegment();
  const active = tabs.find((t) => t === segment) ?? "paris";
  const base = `/l/${leagueId}`;
  return (
    <TabBar
      active={active}
      hrefs={{
        paris: `${base}/paris`,
        classement: `${base}/classement`,
        chat: `${base}/chat`,
        moi: `${base}/moi`,
      }}
    />
  );
}
