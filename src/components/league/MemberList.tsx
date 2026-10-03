"use client";

import { useState, useTransition } from "react";
import { changeRoleAction, removeMemberAction } from "@/app/(app)/league-actions";
import { ListGroup } from "@/components/List";
import { RoleBadge, roleLabels } from "@/components/RoleBadge";
import { Avatar, BottomSheet, Button, IconButton, MoreIcon } from "@/components/ui";
import type { Role } from "@/server/auth/access";

type Member = {
  userId: string;
  username: string;
  image: string | null;
  ring: string | null;
  role: Role;
};

/** Membres et rôles. L'owner bascule joueur ↔ admin d'un appui, exclut par les trois points. */
export function MemberList({
  leagueId,
  leagueName,
  members,
  me,
  isOwner,
}: {
  leagueId: string;
  leagueName: string;
  members: Member[];
  me: string;
  isOwner: boolean;
}) {
  const [pending, start] = useTransition();
  const [removing, setRemoving] = useState<Member | null>(null);

  return (
    <>
      <ListGroup>
        {members.map((m) => {
          const manageable = isOwner && m.role !== "owner";
          return (
            <div key={m.userId}>
              <div className="flex min-h-[64px] items-center gap-3">
                <Avatar
                  name={m.username}
                  src={m.image}
                  ring={m.ring ?? undefined}
                  size={40}
                  background="surface-raised"
                />
                <span className="grow text-[15px] leading-5 font-semibold">
                  {m.username}
                  {m.userId === me && <span className="font-medium text-ink-subtle"> (toi)</span>}
                </span>
                {manageable ? (
                  <button
                    type="button"
                    aria-label={`Rôle de ${m.username} : ${roleLabels[m.role]}`}
                    disabled={pending}
                    onClick={() =>
                      start(() =>
                        changeRoleAction(
                          leagueId,
                          m.userId,
                          m.role === "admin" ? "player" : "admin",
                        ),
                      )
                    }
                    className="flex min-h-[44px] items-center"
                  >
                    <RoleBadge role={m.role} />
                  </button>
                ) : (
                  <span className="flex min-h-[44px] items-center">
                    <RoleBadge role={m.role} />
                  </span>
                )}
                {manageable && (
                  <IconButton label={`Actions sur ${m.username}`} onClick={() => setRemoving(m)}>
                    <MoreIcon size={20} />
                  </IconButton>
                )}
              </div>
            </div>
          );
        })}
      </ListGroup>
      {isOwner && (
        <p className="text-caption text-ink-subtle">
          Appuie sur un rôle pour le changer. Un seul owner par ligue ; les trois points servent à
          exclure.
        </p>
      )}
      <BottomSheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing ? `Exclure ${removing.username}` : "Exclure"}
      >
        {removing && (
          <>
            <p className="text-body text-ink-muted">
              {removing.username} quitte {leagueName} et garde son solde. Le code actuel permet de
              revenir : pour l&apos;empêcher, régénère le code dans les réglages.
            </p>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await removeMemberAction(leagueId, removing.userId);
                  setRemoving(null);
                })
              }
            >
              Exclure {removing.username}
            </Button>
          </>
        )}
      </BottomSheet>
    </>
  );
}
