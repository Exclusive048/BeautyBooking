import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-metadata";
import * as UI_TEXT from "@/lib/ui/text";
import { LegalLayout } from "@/features/legal/components/legal-layout";
import { PdConsentContent, PD_CONSENT_SECTIONS } from "@/features/legal/content/pd-consent-content";
import { getLegalDraftMode } from "@/lib/legal/config";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";

export const metadata: Metadata = pageMetadata(UI_TEXT.meta.pages.consent, { path: "/consent" });

// RKN-FIX-01 — separate per-purpose consent document (152-ФЗ ст. 9 в ред.
// 156-ФЗ). Version + date come from the legal source of truth, the same values
// that land in `UserConsent.documentVersion`.
export default async function ConsentPage() {
  const isDraft = await getLegalDraftMode();
  return (
    <LegalLayout
      title="Согласие на обработку персональных данных"
      lastUpdated={LEGAL_DOCUMENTS.PD_CONSENT.updatedAt}
      version={LEGAL_DOCUMENTS.PD_CONSENT.version}
      sections={PD_CONSENT_SECTIONS}
      isDraft={isDraft}
    >
      <PdConsentContent />
    </LegalLayout>
  );
}
