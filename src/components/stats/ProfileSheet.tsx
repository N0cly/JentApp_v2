"use client";

import { useCallback, useRef, useState } from "react";
import { profileAction } from "@/app/(app)/l/[ligue]/stats-actions";
import { RoleBadge } from "@/components/RoleBadge";
import { Amount, Avatar, BottomSheet, Button } from "@/components/ui";
import { rankLabel } from "@/lib/rank";
import type { ProfileView } from "@/server/stats";
import { HistoryRow } from "./HistoryRow";
import { StatGrid } from "./StatGrid";

/** Feuille « Profil d'un membre » (profil-d-un-membre.html). */
function ProfileSheet({
  leagueId,
  profile,
  onClose,
}: {
  leagueId: string;
  profile: ProfileView | null;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      open={profile !== null}
      onClose={onClose}
      title={profile?.username ?? ""}
      truncateTitle
    >
      {profile && (
        <>
          <div className="flex items-center gap-3">
            <Avatar
              name={profile.username}
              src={profile.image}
              ring={profile.ring ?? undefined}
              size={64}
            />
            <div className="flex flex-col items-start gap-2">
              <RoleBadge role={profile.role} />
              <span className="flex items-center gap-2 text-[14px] leading-5 text-ink-muted">
                {rankLabel(profile.rank)} de la ligue ·
                <Amount value={profile.balance} className="text-ink" />
              </span>
            </div>
          </div>
          <StatGrid stats={profile.stats} />
          {profile.recent.length > 0 && (
            <>
              <h3 className="text-overline text-ink-subtle">DERNIERS PARIS</h3>
              <div className="flex flex-col">
                {profile.recent.map((item) => (
                  <HistoryRow key={item.betId} item={item} onRaised />
                ))}
              </div>
            </>
          )}
          {profile.canManage && (
            <Button variant="secondary" href={`/l/${leagueId}/reglages/membres`}>
              Gérer ce membre
            </Button>
          )}
        </>
      )}
    </BottomSheet>
  );
}

/** Ouvre le profil d'un membre ; sans profil (parti, supprimé), rien ne se passe. */
export function useProfileSheet(leagueId: string) {
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const latest = useRef(0);

  const open = useCallback(
    (userId: string) => {
      const call = ++latest.current;
      void profileAction(leagueId, userId).then((view) => {
        if (call === latest.current && view) setProfile(view);
      });
    },
    [leagueId],
  );

  const sheet = (
    <ProfileSheet leagueId={leagueId} profile={profile} onClose={() => setProfile(null)} />
  );
  return { open, sheet };
}
