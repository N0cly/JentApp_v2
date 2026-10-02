import { Ticket, TicketCut, TicketOverline, TicketRow, TicketSection } from "@/components/ui";

/** Aperçu d'une invitation : nom, membres, invité par, dotation. */
export function InvitePreviewTicket({
  code,
  name,
  members,
  invitedBy,
  joinGrant,
}: {
  code: string;
  name: string;
  members: number;
  invitedBy: string | null;
  joinGrant: number;
}) {
  return (
    <Ticket behind="bg" className="shrink-0">
      <TicketSection>
        <TicketOverline end={`CODE ${code}`}>INVITATION</TicketOverline>
        <div className="mb-1 text-[24px] leading-[28px] font-extrabold tracking-[-0.01em] [font-stretch:85%]">
          {name}
        </div>
        <TicketRow label="Membres">{members}</TicketRow>
        {invitedBy && <TicketRow label="Invité par">{invitedBy}</TicketRow>}
      </TicketSection>
      <TicketCut />
      <TicketSection>
        <TicketRow label="Dotation de départ">
          <span className="text-[20px] leading-6">{joinGrant} clopes</span>
        </TicketRow>
      </TicketSection>
    </Ticket>
  );
}
