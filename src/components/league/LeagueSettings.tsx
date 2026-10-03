"use client";

import { useActionState, useState, useTransition } from "react";
import {
  deleteLeagueAction,
  leaveLeagueAction,
  regenerateCodeAction,
  renameLeagueAction,
  transferLeagueAction,
} from "@/app/(app)/league-actions";
import { FormMessage } from "@/components/FormMessage";
import { useFormErrors, type FormState } from "@/components/forms/use-form-errors";
import { ListGroup, ListRow, SectionTitle } from "@/components/List";
import { BottomSheet, Button, TextField } from "@/components/ui";
import { economyControls, EconomySheet, type EconomyField } from "./EconomySheet";
import { RoundButton } from "./RoundSheet";

type Member = { userId: string; username: string };

type Props = {
  league: {
    id: string;
    name: string;
    inviteCode: string;
    joinGrant: number;
    weeklyGrant: number;
    seedAmount: number;
    members: number;
  };
  isOwner: boolean;
  /** Membres à qui transférer la ligue (sans l'owner). */
  others: Member[];
};

type Sheet = "rename" | "leave" | "manage" | null;

export function LeagueSettings({ league, isOwner, others }: Props) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [editing, setEditing] = useState<EconomyField | null>(null);
  const [regenerating, startRegenerate] = useTransition();
  const close = () => setSheet(null);
  const base = `/l/${league.id}`;

  return (
    <>
      <SectionTitle>LIGUE</SectionTitle>
      <ListGroup>
        <ListRow
          label="Nom"
          value={league.name}
          onClick={isOwner ? () => setSheet("rename") : undefined}
        />
        <ListRow label="Membres" value={league.members} href={`${base}/reglages/membres`} />
        <ListRow label="Journal" href={`${base}/reglages/journal`} />
      </ListGroup>

      <SectionTitle>ÉCONOMIE, EN CLOPES</SectionTitle>
      <ListGroup>
        {(["joinGrant", "weeklyGrant", "seedAmount"] as const).map((field) => (
          <ListRow
            key={field}
            label={economyControls[field].label}
            hint={
              field === "seedAmount" && isOwner
                ? "Un changement ne vaut que pour la suite"
                : undefined
            }
            value={league[field]}
            onClick={isOwner ? () => setEditing(field) : undefined}
          />
        ))}
      </ListGroup>
      {editing && (
        <EconomySheet
          leagueId={league.id}
          field={editing}
          value={league[editing]}
          onClose={() => setEditing(null)}
        />
      )}

      <SectionTitle>INVITATION</SectionTitle>
      <ListGroup>
        <ListRow label="Code" value={league.inviteCode} href={`${base}/inviter`} />
        {isOwner && (
          <ListRow
            label="Régénérer le code"
            hint="L'ancien code ne marchera plus"
            chevron={false}
            onClick={
              regenerating
                ? undefined
                : () => startRegenerate(() => regenerateCodeAction(league.id))
            }
          />
        )}
      </ListGroup>

      {isOwner && <RoundButton leagueId={league.id} members={league.members} />}

      {isOwner ? (
        <Button variant="discreet" destructive onClick={() => setSheet("manage")}>
          Transférer ou supprimer la ligue
        </Button>
      ) : (
        <Button variant="discreet" destructive onClick={() => setSheet("leave")}>
          Quitter la ligue
        </Button>
      )}

      {isOwner && <RenameSheet open={sheet === "rename"} onClose={close} league={league} />}
      {!isOwner && <LeaveSheet open={sheet === "leave"} onClose={close} league={league} />}
      {isOwner && (
        <ManageSheet open={sheet === "manage"} onClose={close} league={league} others={others} />
      )}
    </>
  );
}

function RenameSheet({
  open,
  onClose,
  league,
}: {
  open: boolean;
  onClose: () => void;
  league: Props["league"];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    renameLeagueAction.bind(null, league.id),
    {},
  );
  const { formRef, error, clear } = useFormErrors(state);
  const [name, setName] = useState(league.name);
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.done) onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Nom de la ligue">
      <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Nom de la ligue"
          name="name"
          maxLength={30}
          error={error("name")}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clear("name");
          }}
        />
        <Button type="submit" disabled={pending}>
          Enregistrer
        </Button>
      </form>
    </BottomSheet>
  );
}

function LeaveSheet({
  open,
  onClose,
  league,
}: {
  open: boolean;
  onClose: () => void;
  league: Props["league"];
}) {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  return (
    <BottomSheet open={open} onClose={onClose} title="Quitter la ligue">
      {state.formError && <FormMessage>{state.formError}</FormMessage>}
      <p className="text-body text-ink-muted">
        Tu quittes {league.name}. Ton solde est gardé : tu le retrouves si tu reviens avec un code.
      </p>
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => start(async () => setState(await leaveLeagueAction(league.id)))}
      >
        Quitter {league.name}
      </Button>
    </BottomSheet>
  );
}

function ManageSheet({
  open,
  onClose,
  league,
  others,
}: {
  open: boolean;
  onClose: () => void;
  league: Props["league"];
  others: Member[];
}) {
  const [step, setStep] = useState<"choose" | "transfer" | "delete">("choose");
  const [target, setTarget] = useState<Member | null>(null);
  const [transferring, startTransfer] = useTransition();
  const [state, action, pending] = useActionState<FormState, FormData>(
    deleteLeagueAction.bind(null, league.id),
    {},
  );
  const { formRef, error, clear } = useFormErrors(state);
  const [confirmation, setConfirmation] = useState("");

  function reset() {
    setStep("choose");
    setTarget(null);
    onClose();
  }

  const title =
    step === "delete"
      ? "Supprimer la ligue"
      : step === "transfer"
        ? "Transférer la ligue"
        : "Transférer ou supprimer";

  return (
    <BottomSheet open={open} onClose={reset} title={title}>
      {step === "choose" && (
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            disabled={others.length === 0}
            onClick={() => setStep("transfer")}
          >
            Transférer à un membre
          </Button>
          <Button variant="secondary" onClick={() => setStep("delete")}>
            Supprimer la ligue
          </Button>
        </div>
      )}

      {step === "transfer" && !target && (
        <ListGroup>
          {others.map((m) => (
            <ListRow key={m.userId} label={m.username} mono={false} onClick={() => setTarget(m)} />
          ))}
        </ListGroup>
      )}

      {step === "transfer" && target && (
        <>
          <p className="text-body text-ink-muted">
            {target.username} devient owner de {league.name}. Tu deviens admin.
          </p>
          <Button
            disabled={transferring}
            onClick={() =>
              startTransfer(async () => {
                await transferLeagueAction(league.id, target.userId);
                reset();
              })
            }
          >
            Transférer à {target.username}
          </Button>
        </>
      )}

      {step === "delete" && (
        <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
          <p className="text-body text-ink-muted">
            La ligue, ses membres et son historique disparaissent pour tout le monde. Écris «{" "}
            {league.name} » pour confirmer.
          </p>
          <TextField
            label="Nom de la ligue"
            name="confirmation"
            autoComplete="off"
            error={error("confirmation")}
            value={confirmation}
            onChange={(e) => {
              setConfirmation(e.target.value);
              clear("confirmation");
            }}
          />
          <Button
            variant="danger"
            type="submit"
            disabled={pending || confirmation.trim() !== league.name}
          >
            Supprimer définitivement
          </Button>
        </form>
      )}
    </BottomSheet>
  );
}
