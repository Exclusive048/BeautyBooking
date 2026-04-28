import type { Metadata } from "next";
import { LegalLayout } from "@/features/legal/components/legal-layout";
import { TermsContent, TERMS_SECTIONS } from "@/features/legal/content/terms-content";
import { getLegalDraftMode } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Пользовательское соглашение — МастерРядом",
  description:
    "Пользовательское соглашение МастерРядом: правила использования сервиса, оплата, ответственность сторон.",
  alternates: { canonical: "/terms" },
};

const LAST_UPDATED = "2026-04-28";

export default async function TermsPage() {
  const isDraft = await getLegalDraftMode();
  return (
    <LegalLayout
      title="Пользовательское соглашение"
      lastUpdated={LAST_UPDATED}
      sections={TERMS_SECTIONS}
      isDraft={isDraft}
    >
      <TermsContent />
    </LegalLayout>
  );
}
