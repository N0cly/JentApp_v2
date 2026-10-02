"use client";

import { useState } from "react";
import { BetOption, Button } from "@/components/ui";
import type { BetView } from "@/server/bets/view";
import { TicketSheet, type TicketTarget } from "./TicketSheet";

type OpenView = Extract<BetView, { state: "open" }>;

/** Options du pari ouvert : un appui ouvre le ticket ; « Augmenter ma mise » si déjà misé. */
export function OpenBetOptions({
  leagueId,
  view,
  balance,
}: {
  leagueId: string;
  view: OpenView;
  balance: number;
}) {
  const [ticket, setTicket] = useState<TicketTarget | null>(null);
  const bet = {
    id: view.id,
    question: view.question,
    moment: view.moment,
    closesAt: view.closesAt,
    pot: view.pot,
  };
  const mine = view.options.find((o) => o.id === view.myWager?.optionId);
  return (
    <>
      <div className="flex flex-col gap-2">
        {view.options.map((option) => {
          const isMine = option.id === mine?.id;
          return (
            <BetOption
              key={option.id}
              label={option.label}
              myStake={isMine ? view.myWager!.amount : undefined}
              onClick={
                view.myWager ? undefined : () => setTicket({ bet, option, alreadyStaked: null })
              }
            />
          );
        })}
      </div>
      {mine && view.myWager && (
        <div className="order-last">
          <Button
            onClick={() => setTicket({ bet, option: mine, alreadyStaked: view.myWager!.amount })}
          >
            Augmenter ma mise
          </Button>
        </div>
      )}
      {ticket && (
        <TicketSheet
          leagueId={leagueId}
          target={ticket}
          balance={balance}
          onClose={() => setTicket(null)}
        />
      )}
    </>
  );
}
