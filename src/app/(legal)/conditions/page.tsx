import type { Metadata } from "next";
import { LegalScreen } from "../legal-page";

export const metadata: Metadata = { title: "Conditions d'utilisation · JentApp" };

export default function Page() {
  return <LegalScreen page="conditions-d-utilisation" />;
}
