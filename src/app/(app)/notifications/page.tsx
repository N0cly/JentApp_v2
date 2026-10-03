import type { Metadata } from "next";
import { MarkAllRead, NotificationList } from "@/components/notifications/NotificationList";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { isUuid, requireUser } from "@/server/auth";
import { listNotifications } from "@/server/notifications";

export const metadata: Metadata = { title: "Notifications · JentApp" };

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const user = await requireUser("/notifications");
  const ligue = (await searchParams).ligue;
  const back = typeof ligue === "string" && isUuid(ligue) ? `/l/${ligue}/paris` : "/";
  const { items, hasMore } = await listNotifications(user, 0, new Date());
  return (
    <Screen>
      <ScreenHeader
        back={back}
        title="Notifications"
        action={items.length > 0 ? <MarkAllRead /> : undefined}
      />
      <main className="flex grow flex-col gap-4 px-5 pt-2 pb-6">
        <NotificationList initial={items} initialHasMore={hasMore} />
      </main>
    </Screen>
  );
}
