import type { Metadata } from "next";
import { JoinPage } from "../join-page";

export const metadata: Metadata = { title: "Rejoindre une ligue · JentApp" };

export default async function JoinWithCodePage({ params, searchParams }: PageProps<"/j/[code]">) {
  const { code } = await params;
  const { par } = await searchParams;
  return <JoinPage code={code} invitedBy={typeof par === "string" ? par : null} />;
}
