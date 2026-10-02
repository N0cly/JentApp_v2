import { LeagueRow } from "@/components/LeagueRow";
import {
  BetOption,
  Card,
  ClockIcon,
  MomentBadge,
  Ticket,
  TicketCut,
  TicketOverline,
  TicketSection,
} from "@/components/ui";
import { examples } from "./examples";

export function BetIllustration() {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <MomentBadge moment="NIGHT" />
        <span className="flex items-center gap-1 font-mono text-[13px] font-medium text-ink-muted">
          <ClockIcon size={16} />
          {examples.countdown}
        </span>
      </div>
      <div className="text-heading">{examples.question}</div>
      <div className="flex flex-col gap-2">
        {examples.options.map((o) => (
          <BetOption key={o.label} label={o.label} myStake={o.myStake} />
        ))}
      </div>
    </Card>
  );
}

export function PotIllustration() {
  return (
    <Ticket behind="bg">
      <TicketSection>
        <TicketOverline>POT</TicketOverline>
        <div className="font-mono text-[44px] leading-[48px] font-medium">
          {examples.pot} clopes
        </div>
      </TicketSection>
      <TicketCut />
      <TicketSection>
        {examples.payouts.map((p) => (
          <div
            key={p.name}
            className="flex items-baseline justify-between font-mono text-[14px] leading-5 font-medium"
          >
            <span>
              {p.name} · mise {p.stake}
            </span>
            <span className="text-on-paper-win">+{p.gain}</span>
          </div>
        ))}
      </TicketSection>
    </Ticket>
  );
}

export function LeaguesIllustration() {
  return (
    <div className="flex flex-col gap-2">
      {examples.leagues.map((l) => (
        <LeagueRow key={l.name} league={l} active={l.active} />
      ))}
    </div>
  );
}
