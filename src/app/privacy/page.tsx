import type { Metadata } from "next";
import { LegalLayout } from "@/features/legal/components/legal-layout";
import { PrivacyContent, PRIVACY_SECTIONS } from "@/features/legal/content/privacy-content";
import { getLegalDraftMode } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — МастерРядом",
  description:
    "Политика конфиденциальности МастерРядом: какие персональные данные обрабатываем, передача третьим лицам, права субъекта.",
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "2026-04-28";

export default async function PrivacyPage() {
  const isDraft = await getLegalDraftMode();
  return (
    <LegalLayout
      title="Политика конфиденциальности"
      lastUpdated={LAST_UPDATED}
      sections={PRIVACY_SECTIONS}
      isDraft={isDraft}
    >
      <PrivacyContent />
    </LegalLayout>
  );
}
