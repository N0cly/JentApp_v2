import type { Metadata } from "next";
import { JoinPage } from "./join-page";

export const metadata: Metadata = { title: "Rejoindre une ligue · JentApp" };

export default function JoinEmptyPage() {
  return <JoinPage invitedBy={null} />;
}
