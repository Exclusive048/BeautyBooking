import type { Metadata } from "next";
import { LegalLayout } from "@/features/legal/components/legal-layout";
import { PrivacyContent, PRIVACY_SECTIONS } from "@/features/legal/content/privacy-content";
import { getLegalDraftMode } from "@/lib/legal/config";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "Политика конфиденциальности",
  description:
    "Политика конфиденциальности МастерРядом: какие персональные данные обрабатываем, передача третьим лицам, права субъекта.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  const isDraft = await getLegalDraftMode();
  return (
    <LegalLayout
      title="Политика конфиденциальности"
      lastUpdated={LEGAL_DOCUMENTS.PRIVACY.updatedAt}
      version={LEGAL_DOCUMENTS.PRIVACY.version}
      sections={PRIVACY_SECTIONS}
      isDraft={isDraft}
    >
      <PrivacyContent />
    </LegalLayout>
  );
}
