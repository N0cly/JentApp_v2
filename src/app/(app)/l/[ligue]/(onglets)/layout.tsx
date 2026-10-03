import { LeagueTabs } from "@/components/LeagueTabs";
import { Screen } from "@/components/Screen";
import { requireMember } from "@/server/auth";

export default async function TabsLayout({ children, params }: LayoutProps<"/l/[ligue]">) {
  const { ligue } = await params;
  await requireMember(ligue);
  return (
    <Screen className="h-dvh" safeBottom={false}>
      <div className="flex min-h-0 grow flex-col overflow-y-auto">{children}</div>
      <LeagueTabs leagueId={ligue} />
    </Screen>
  );
}
