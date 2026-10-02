import type { Metadata } from "next";
import Link from "next/link";
import { DeleteAccountForm } from "@/components/account/DeleteAccountForm";
import { ListGroup } from "@/components/List";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { CheckIcon, CloseIcon } from "@/components/ui";
import { blockingLeagues } from "@/server/account";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Supprimer mon compte · JentApp" };

function Consequence({ kept, children }: { kept?: boolean; children: string }) {
  return (
    <div>
      <div className="flex items-start gap-3 py-3">
        <span className={kept ? "flex text-ink-muted" : "flex text-loss"}>
          {kept ? <CheckIcon size={18} /> : <CloseIcon size={18} />}
        </span>
        <span className="text-[14px] leading-5">{children}</span>
      </div>
    </div>
  );
}

export default async function DeleteAccountPage() {
  const user = await requireUser("/compte/supprimer");
  const blocking = await blockingLeagues(user.id);

  return (
    <Screen>
      <ScreenHeader back="/compte/aide" title="Supprimer mon compte" />
      <main className="flex grow flex-col gap-4 px-5 pt-2 pb-6">
        <h1 className="text-[28px] leading-8 font-extrabold tracking-[-0.02em] [font-stretch:85%]">
          C&apos;est définitif
        </h1>
        <ListGroup>
          <Consequence>Ton email, ton mot de passe et ta photo sont effacés.</Consequence>
          <Consequence>
            Ton pseudo devient « Joueur supprimé » dans tes ligues, et tes messages sont retirés.
          </Consequence>
          <Consequence kept>
            Tes mises et tes gains passés restent dans les comptes des ligues, sans ton nom.
          </Consequence>
        </ListGroup>
        {blocking.map((league) => (
          <div key={league.id} className="flex flex-col gap-2 rounded-md bg-loss-soft px-4 py-3">
            <span className="text-[14px] leading-5 font-semibold">
              Tu es owner de {league.name}.
            </span>
            <span className="text-[13px] leading-[18px] text-ink-muted">
              Transfère la ligue à un membre ou supprime-la avant de continuer.
            </span>
            <Link
              href={`/l/${league.id}/reglages`}
              className="flex min-h-[44px] items-center text-[14px] font-semibold text-brand"
            >
              Transférer {league.name}
            </Link>
          </div>
        ))}
        <DeleteAccountForm username={user.username} blocked={blocking.length > 0} />
      </main>
    </Screen>
  );
}
