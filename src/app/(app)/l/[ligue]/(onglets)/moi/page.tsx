import type { Metadata } from "next";
import { LeagueTopBar } from "@/components/LeagueTopBar";
import { Avatar, IconButton, SettingsIcon } from "@/components/ui";
import { requireMember } from "@/server/auth";

export const metadata: Metadata = { title: "Moi · JentApp" };

export default async function MePage({ params }: PageProps<"/l/[ligue]/moi">) {
  const { ligue } = await params;
  const { user } = await requireMember(ligue);
  return (
    <>
      <div className="shrink-0 px-5 pt-3">
        <LeagueTopBar
          userId={user.id}
          leagueId={ligue}
          action={
            <IconButton label="Réglages" variant="outlined" href={`/compte?ligue=${ligue}`}>
              <SettingsIcon size={20} />
            </IconButton>
          }
        />
      </div>
      <header className="flex shrink-0 items-center gap-3 px-5 pt-3 pb-4">
        <Avatar name={user.username} size={56} />
        <h1 className="text-[24px] leading-[28px] font-extrabold tracking-[-0.01em] [font-stretch:85%]">
          {user.username}
        </h1>
      </header>
    </>
  );
}
