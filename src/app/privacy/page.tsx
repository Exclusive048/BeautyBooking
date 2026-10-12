import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-metadata";
import * as UI_TEXT from "@/lib/ui/text";
import { LegalLayout } from "@/features/legal/components/legal-layout";
import { PrivacyContent, PRIVACY_SECTIONS } from "@/features/legal/content/privacy-content";
import { getLegalDraftMode } from "@/lib/legal/config";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

export const metadata: Metadata = pageMetadata(UI_TEXT.meta.pages.privacy, { path: "/privacy" });

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
