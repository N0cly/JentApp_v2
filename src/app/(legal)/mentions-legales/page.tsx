import type { Metadata } from "next";
import { LegalScreen } from "../legal-page";

export const metadata: Metadata = { title: "Mentions légales · JentApp" };

export default function Page() {
  return <LegalScreen page="mentions-legales" />;
}
