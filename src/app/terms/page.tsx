import type { Metadata } from "next";
import { LegalLayout } from "@/features/legal/components/legal-layout";
import { TermsContent, TERMS_SECTIONS } from "@/features/legal/content/terms-content";
import { getLegalDraftMode } from "@/lib/legal/config";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "Пользовательское соглашение",
  description:
    "Пользовательское соглашение МастерРядом: правила использования сервиса, оплата, ответственность сторон.",
  alternates: { canonical: "/terms" },
};

// RKN-FIX-01: version/date come from the legal source of truth — this is the
// document `UserConsent(TERMS)` rows point at.
export default async function TermsPage() {
  const isDraft = await getLegalDraftMode();
  return (
    <LegalLayout
      title="Пользовательское соглашение"
      lastUpdated={LEGAL_DOCUMENTS.TERMS.updatedAt}
      version={LEGAL_DOCUMENTS.TERMS.version}
      sections={TERMS_SECTIONS}
      isDraft={isDraft}
    >
      <TermsContent />
    </LegalLayout>
  );
}
