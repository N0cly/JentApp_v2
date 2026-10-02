import type { Metadata } from "next";
import { LegalScreen } from "../legal-page";

export const metadata: Metadata = { title: "Politique de confidentialité · JentApp" };

export default function Page() {
  return <LegalScreen page="confidentialite" />;
}
