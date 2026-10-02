import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/(compte)/actions";
import { EmailBanner } from "@/components/EmailBanner";
import { Screen } from "@/components/Screen";
import { Button, ChevronRightIcon, PlusIcon, TicketIcon } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { listMyLeagues } from "@/server/leagues";

export const metadata: Metadata = { title: "Bienvenue · JentApp" };

function Choice({
  href,
  title,
  text,
  icon,
}: {
  href: string;
  title: string;
  text: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg bg-surface p-4">
      <span className="flex size-[44px] shrink-0 items-center justify-center rounded-full bg-surface-raised text-brand">
        {icon}
      </span>
      <span className="flex grow flex-col">
        <span className="text-[17px] leading-[22px] font-bold">{title}</span>
        <span className="text-caption text-ink-muted">{text}</span>
      </span>
      <span className="flex text-ink-subtle">
        <ChevronRightIcon size={18} />
      </span>
    </Link>
  );
}

export default async function WelcomePage({ searchParams }: PageProps<"/bienvenue">) {
  const user = await requireUser("/bienvenue");
  // Cet écran est celui de « aucune ligue ».
  if ((await listMyLeagues(user)).length > 0) redirect("/");
  const expired = (await searchParams).lien === "expire";

  return (
    <Screen>
      <main className="flex grow flex-col gap-4 px-6 pt-[calc(var(--space-8)*2)] pb-6">
        <h1 className="text-[40px] leading-[44px] font-extrabold tracking-[-0.02em] [font-stretch:85%]">
          Bienvenue, {user.username}
        </h1>
        <p className="text-body text-ink-muted">
          Tu n&apos;es encore dans aucune ligue. Rejoins ta bande ou lance la tienne.
        </p>
        {!user.emailVerified && <EmailBanner email={user.email} expired={expired} />}
        <Choice
          href="/j"
          title="Rejoindre avec un code"
          text="Un membre t'a donné six caractères"
          icon={<TicketIcon size={20} />}
        />
        <Choice
          href="/ligues/nouvelle"
          title="Créer une ligue"
          text="Tu en deviens l'owner"
          icon={<PlusIcon size={20} />}
        />
        <div className="grow" />
        <form action={signOutAction}>
          <Button variant="discreet" type="submit" className="w-full">
            Se déconnecter
          </Button>
        </form>
      </main>
    </Screen>
  );
}
