import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Amount,
  Avatar,
  BellIcon,
  BetOption,
  Button,
  Card,
  ChevronLeftIcon,
  ClopeIcon,
  CloseIcon,
  IconButton,
  JointIcon,
  LeagueBadge,
  MinusIcon,
  MomentBadge,
  PaquetIcon,
  PlusIcon,
  ShareIcon,
  Stamp,
  TabBar,
  TextField,
  Ticket,
  TicketCut,
  TicketOverline,
  TicketRow,
  TicketSection,
  TicketTitle,
} from "@/components/ui";
import {
  CardCountdown,
  ChipDemo,
  ChoiceDemo,
  CountdownDemo,
  LeagueSheetDemo,
  SegmentedDemo,
} from "./demos";
import { sample } from "./sample";

export const metadata: Metadata = { title: "Kit · JentApp" };

function Section({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section aria-labelledby={name} className="flex flex-col gap-3">
      <h2 id={name} className="text-overline text-ink-subtle">
        {name}
      </h2>
      {children}
    </section>
  );
}

const tabHrefs = { paris: "#TabBar", classement: "#TabBar", chat: "#TabBar", moi: "#TabBar" };

export default function KitPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col">
      <main className="flex grow flex-col gap-6 px-5 pt-3 pb-8">
        <header className="flex flex-col gap-1">
          <p className="text-overline text-ink-subtle">JentApp · M0</p>
          <h1 className="text-title">Kit</h1>
          <p className="text-body text-ink-muted">
            Les composants de base, dans leurs états. Données d&apos;exemple.
          </p>
        </header>

        <Section name="Button">
          <Button>Valider le ticket</Button>
          <Button disabled>Valider le ticket</Button>
          <Button variant="secondary">Rejoindre</Button>
          <Button variant="danger">Supprimer définitivement</Button>
          <Button variant="danger" disabled>
            Supprimer définitivement
          </Button>
          <div className="flex justify-between">
            <Button variant="discreet">Passer</Button>
            <Button variant="discreet" destructive>
              Annuler et rendre les mises
            </Button>
          </div>
        </Section>

        <Section name="IconButton">
          <div className="flex items-center gap-2">
            <IconButton label="Retour">
              <ChevronLeftIcon size={22} />
            </IconButton>
            <IconButton label="Fermer">
              <CloseIcon size={22} />
            </IconButton>
            <IconButton label="Partager dans le chat" className="text-ink">
              <ShareIcon size={20} />
            </IconButton>
            <IconButton label="Nouveau pari" variant="brand">
              <PlusIcon size={22} />
            </IconButton>
            <IconButton label="Notifications, 2 non lues" variant="outlined">
              <BellIcon size={20} />
              <span className="absolute top-2 right-2 size-[8px] rounded-full bg-loss" />
            </IconButton>
          </div>
          <div className="flex items-center gap-4">
            <IconButton label="Retirer une clope" variant="outlined" size="lg">
              <MinusIcon size={22} />
            </IconButton>
            <IconButton label="Ajouter une clope" variant="outlined" size="lg">
              <PlusIcon size={22} />
            </IconButton>
          </div>
        </Section>

        <Section name="Chip">
          <ChipDemo />
        </Section>

        <Section name="Segmented">
          <SegmentedDemo />
        </Section>

        <Section name="MomentBadge">
          <div className="flex flex-wrap gap-2">
            <MomentBadge moment="BEFORE" />
            <MomentBadge moment="NIGHT" />
            <MomentBadge moment="AFTER" />
            <MomentBadge moment="DAILY" />
            <MomentBadge moment="SPECIAL" />
          </div>
        </Section>

        <Section name="Countdown">
          <CountdownDemo />
        </Section>

        <Section name="Amount">
          <div className="flex flex-wrap items-center gap-4">
            <Amount value={sample.balance} size="sm" />
            <Amount value={sample.balance} />
            <Amount value={45} size="lg" />
            <Amount value={sample.balance} size="xl" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Amount value={19} delta />
            <Amount value={-8} delta />
            <Amount value={5} unit="joint" />
            <Amount value={20} unit="paquet" />
          </div>
          <div className="flex items-center gap-4 text-ink">
            <ClopeIcon />
            <JointIcon />
            <PaquetIcon />
          </div>
        </Section>

        <Section name="BetOption">
          <BetOption label={sample.options[0]} href="#BetOption" />
          <BetOption label={sample.options[1]} myStake={sample.myStake} />
          <BetOption label={sample.options[2]} />
          <ChoiceDemo />
        </Section>

        <Section name="Card">
          <Card>
            <div className="flex items-center justify-between">
              <MomentBadge moment="NIGHT" />
              <CardCountdown />
            </div>
            <h3 className="text-heading">{sample.question}</h3>
            <div className="flex flex-col gap-2">
              {sample.options.map((option) => (
                <BetOption key={option} label={option} href="#Card" />
              ))}
            </div>
            <div className="text-caption flex items-center justify-between text-ink-subtle">
              <span className="flex items-center gap-1">
                <span className="text-ink">
                  <Amount value={sample.pot} size="sm" />
                </span>
                · {sample.bettors} parieurs
              </span>
              <span>par {sample.creator}</span>
            </div>
          </Card>
        </Section>

        <Section name="Ticket">
          <div className="rounded-lg bg-surface-raised p-4">
            <Ticket behind="surface-raised">
              <TicketSection>
                <TicketOverline end="FERME À 23:30">NIGHT</TicketOverline>
                <TicketTitle>{sample.question}</TicketTitle>
                <TicketRow label="Choix">{sample.options[1]}</TicketRow>
                <TicketRow label="Pot actuel">{sample.pot} clopes</TicketRow>
              </TicketSection>
              <TicketCut />
              <TicketSection>
                <TicketRow label="Mise">{sample.myStake} clopes</TicketRow>
                <TicketRow label="Gain">connu à la fermeture</TicketRow>
              </TicketSection>
            </Ticket>
          </div>
          <Ticket behind="bg" stamp={<Stamp outcome="won" />}>
            <TicketSection>
              <TicketOverline>TON TICKET</TicketOverline>
              <TicketRow label="Résultat">{sample.players[0].name}</TicketRow>
              <TicketRow label="Ta mise">7 clopes</TicketRow>
              <TicketRow label="Cote finale">x2.67</TicketRow>
            </TicketSection>
            <TicketCut />
            <TicketSection>
              <TicketRow label="Gain" outcome="win">
                +19 clopes
              </TicketRow>
            </TicketSection>
          </Ticket>
          <Ticket behind="bg" stamp={<Stamp outcome="lost" />}>
            <TicketSection>
              <TicketOverline>TON TICKET</TicketOverline>
              <TicketRow label="Résultat">{sample.players[0].name}</TicketRow>
              <TicketRow label="Ta mise">8 clopes</TicketRow>
              <TicketRow label="Cote finale">x2.67</TicketRow>
            </TicketSection>
            <TicketCut />
            <TicketSection>
              <TicketRow label="Gain" outcome="loss">
                −8 clopes
              </TicketRow>
            </TicketSection>
          </Ticket>
        </Section>

        <Section name="Stamp">
          <div className="flex gap-6 rounded-sm bg-paper p-4">
            <Stamp outcome="won" />
            <Stamp outcome="lost" />
          </div>
        </Section>

        <Section name="Avatar">
          <div className="flex flex-wrap items-end gap-3">
            <Avatar name={sample.players[2].name} size={32} />
            <Avatar name={sample.players[2].name} size={36} />
            <Avatar name={sample.players[2].name} size={40} />
            <Avatar
              name={sample.players[1].name}
              size={48}
              ring={sample.players[1].ring}
              ringWidth={3}
            />
            <Avatar name={sample.players[1].name} size={56} ring={sample.players[1].ring} />
            <Avatar
              name={sample.players[0].name}
              size={72}
              ring={sample.players[0].ring}
              ringWidth={3}
            />
          </div>
        </Section>

        <Section name="LeagueBadge">
          <div className="flex items-center gap-3">
            <LeagueBadge name={sample.leagues[0].name} size="sm" active />
            <LeagueBadge name={sample.leagues[0].name} active />
            <LeagueBadge name={sample.leagues[1].name} />
            <LeagueBadge name={sample.leagues[2].name} />
          </div>
        </Section>

        <Section name="LeagueSwitcher et BottomSheet">
          <div className="flex">
            <LeagueSheetDemo />
          </div>
        </Section>

        <Section name="TextField">
          <TextField label="Email" type="email" defaultValue="nocly@exemple.fr" />
          <TextField
            label="Pseudo"
            defaultValue="Nocly"
            hint="3 à 20 caractères. C'est le nom que voient tes ligues."
          />
          <TextField label="Nom de la ligue" placeholder="Coloc" />
        </Section>

        <Section name="TabBar">
          <span className="text-caption text-ink-subtle">
            En bas de l&apos;écran, onglet actif : Paris.
          </span>
        </Section>
      </main>
      <div className="sticky bottom-0">
        <TabBar active="paris" hrefs={tabHrefs} />
      </div>
    </div>
  );
}
