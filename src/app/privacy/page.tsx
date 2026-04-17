import type { Metadata } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { UI_TEXT } from "@/lib/ui/text";
import { InfoPageLayout } from "@/components/layout/info-page-layout";

const LEGAL_ENTITY_NAME = UI_TEXT.pages.privacy.legalEntityNamePlaceholder;
const INN = UI_TEXT.pages.privacy.innPlaceholder;
const OGRN = UI_TEXT.pages.privacy.ogrnPlaceholder;
const LEGAL_ADDRESS = UI_TEXT.pages.privacy.legalAddressPlaceholder;
const CONTACT_EMAILS = {
  privacy: "support@мастеррядом.online",
  legal: "legal@мастеррядом.online",
  support: "support@мастеррядом.online",
};

const DOCUMENT_VERSION = "1.1";
const UPDATED_AT = "12.03.2026";

export const metadata: Metadata = {
  title: UI_TEXT.pages.privacy.title,
  description: UI_TEXT.pages.privacy.description,
  alternates: { canonical: "/privacy" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-text-main">{title}</h2>
      <div className="space-y-2 text-sm text-text-sec">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <InfoPageLayout breadcrumb={UI_TEXT.pages.privacy.navLabel}>
      <header className="space-y-2 pt-4">
        <p className="text-xs text-text-sec">
          {UI_TEXT.pages.privacy.metaLine
            .replace("{version}", DOCUMENT_VERSION)
            .replace("{updatedAt}", UPDATED_AT)}
        </p>
        <h1 className="text-3xl font-semibold text-text-main">{UI_TEXT.pages.privacy.heading}</h1>
        <p className="text-sm text-text-sec">
          {UI_TEXT.pages.privacy.intro}
        </p>
      </header>

      <Card>
        <CardHeader className="space-y-1">
          <div className="text-sm font-semibold text-text-main">{UI_TEXT.pages.privacy.todoTitle}</div>
          <p className="text-xs text-text-sec">
            {UI_TEXT.pages.privacy.todoSubtitle}
          </p>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-text-sec">
          <div>{LEGAL_ENTITY_NAME}</div>
          <div>
            {UI_TEXT.pages.privacy.innLabel}: {INN}
          </div>
          <div>
            {UI_TEXT.pages.privacy.ogrnLabel}: {OGRN}
          </div>
          <div>
            {UI_TEXT.pages.privacy.legalAddressLabel}: {LEGAL_ADDRESS}
          </div>
          <div>
            {UI_TEXT.pages.privacy.contactsLabel}: {CONTACT_EMAILS.privacy}, {CONTACT_EMAILS.legal}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-6 text-sm text-text-sec">
          <Section title={UI_TEXT.pages.privacy.sections.generalTitle}>
            <p>{UI_TEXT.pages.privacy.sections.generalText}</p>
          </Section>

          <Section title={UI_TEXT.pages.privacy.sections.dataTitle}>
            <ul className="list-disc space-y-1 pl-5">
              {UI_TEXT.pages.privacy.sections.dataItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>

          <Section title={UI_TEXT.pages.privacy.sections.purposesTitle}>
            <ul className="list-disc space-y-1 pl-5">
              {UI_TEXT.pages.privacy.sections.purposesItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>

          <Section title={UI_TEXT.pages.privacy.sections.legalBasisTitle}>
            <p>{UI_TEXT.pages.privacy.sections.legalBasisText}</p>
          </Section>

          <Section title={UI_TEXT.pages.privacy.sections.securityTitle}>
            <p>{UI_TEXT.pages.privacy.sections.securityText}</p>
          </Section>

          <Section title={UI_TEXT.pages.privacy.sections.sharingTitle}>
            <p>{UI_TEXT.pages.privacy.sections.sharingText}</p>
          </Section>

          <Section title={UI_TEXT.pages.privacy.sections.rightsTitle}>
            <ul className="list-disc space-y-1 pl-5">
              {UI_TEXT.pages.privacy.sections.rightsItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>

          <Section title={UI_TEXT.pages.privacy.sections.contactsTitle}>
            <p>
              {UI_TEXT.pages.privacy.sections.contactsPrivacy
                .replace("{privacy}", CONTACT_EMAILS.privacy)
                .replace("{legal}", CONTACT_EMAILS.legal)}
            </p>
            <p>
              {UI_TEXT.pages.privacy.sections.contactsSupport.replace("{support}", CONTACT_EMAILS.support)}
            </p>
          </Section>
        </CardContent>
      </Card>
      </InfoPageLayout>
    </div>
  );
}

