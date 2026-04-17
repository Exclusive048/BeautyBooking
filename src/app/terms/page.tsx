import type { Metadata } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { UI_TEXT } from "@/lib/ui/text";
import { InfoPageLayout } from "@/components/layout/info-page-layout";

const LEGAL_ENTITY_NAME = UI_TEXT.pages.terms.legalEntityNamePlaceholder;
const INN = UI_TEXT.pages.terms.innPlaceholder;
const OGRN = UI_TEXT.pages.terms.ogrnPlaceholder;
const LEGAL_ADDRESS = UI_TEXT.pages.terms.legalAddressPlaceholder;
const CONTACT_EMAILS = {
  privacy: "support@мастеррядом.online",
  legal: "legal@мастеррядом.online",
  support: "support@мастеррядом.online",
};

const LISTED_PRICE_RUB = UI_TEXT.pages.terms.pricingPlaceholders.listedPrice;
const PROMOTED_PRICE_RUB = UI_TEXT.pages.terms.pricingPlaceholders.promotedPrice;
const COMMISSION_PCT = UI_TEXT.pages.terms.pricingPlaceholders.commission;
const MIN_PAYOUT_RUB = UI_TEXT.pages.terms.pricingPlaceholders.minPayout;

const DOCUMENT_VERSION = "1.1";
const UPDATED_AT = "12.03.2026";

export const metadata: Metadata = {
  title: UI_TEXT.pages.terms.title,
  description: UI_TEXT.pages.terms.description,
  alternates: { canonical: "/terms" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-text-main">{title}</h2>
      <div className="space-y-2 text-sm text-text-sec">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <InfoPageLayout breadcrumb={UI_TEXT.pages.terms.navLabel}>
      <header className="space-y-2 pt-4">
        <p className="text-xs text-text-sec">
          {UI_TEXT.pages.terms.metaLine
            .replace("{version}", DOCUMENT_VERSION)
            .replace("{updatedAt}", UPDATED_AT)}
        </p>
        <h1 className="text-3xl font-semibold text-text-main">{UI_TEXT.pages.terms.heading}</h1>
        <p className="text-sm text-text-sec">
          {UI_TEXT.pages.terms.intro}
        </p>
      </header>

      <Card>
        <CardHeader className="space-y-1">
          <div className="text-sm font-semibold text-text-main">{UI_TEXT.pages.terms.todoTitle}</div>
          <p className="text-xs text-text-sec">
            {UI_TEXT.pages.terms.todoSubtitle}
          </p>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-text-sec">
          <div>{LEGAL_ENTITY_NAME}</div>
          <div>
            {UI_TEXT.pages.terms.innLabel}: {INN}
          </div>
          <div>
            {UI_TEXT.pages.terms.ogrnLabel}: {OGRN}
          </div>
          <div>
            {UI_TEXT.pages.terms.legalAddressLabel}: {LEGAL_ADDRESS}
          </div>
          <div>
            {UI_TEXT.pages.terms.contactsLabel}: {CONTACT_EMAILS.legal}, {CONTACT_EMAILS.support}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-6 text-sm text-text-sec">
          <Section title={UI_TEXT.pages.terms.sections.termsTitle}>
            <p>{UI_TEXT.pages.terms.sections.termsText}</p>
          </Section>

          <Section title={UI_TEXT.pages.terms.sections.accessTitle}>
            <p>{UI_TEXT.pages.terms.sections.accessText}</p>
          </Section>

          <Section title={UI_TEXT.pages.terms.sections.bookingsTitle}>
            <ul className="list-disc space-y-1 pl-5">
              {UI_TEXT.pages.terms.sections.bookingsItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>

          <Section title={UI_TEXT.pages.terms.sections.paymentsTitle}>
            <p>{UI_TEXT.pages.terms.sections.paymentsText}</p>
          </Section>

          <Section title={UI_TEXT.pages.terms.sections.liabilityTitle}>
            <p>{UI_TEXT.pages.terms.sections.liabilityText}</p>
          </Section>

          <Section title={UI_TEXT.pages.terms.sections.ipTitle}>
            <p>{UI_TEXT.pages.terms.sections.ipText}</p>
          </Section>

          <Section title={UI_TEXT.pages.terms.sections.terminationTitle}>
            <p>{UI_TEXT.pages.terms.sections.terminationText}</p>
          </Section>

          <Section title={UI_TEXT.pages.terms.sections.pricingTitle}>
            <p className="font-medium text-text-main">{UI_TEXT.pages.terms.sections.pricingSubtitle}</p>
            <ul className="list-disc space-y-1 pl-5">
              {UI_TEXT.pages.terms.sections.pricingItems.map((item) => (
                <li key={item}>
                  {item
                    .replace("{listedPrice}", LISTED_PRICE_RUB)
                    .replace("{promotedPrice}", PROMOTED_PRICE_RUB)
                    .replace("{commission}", COMMISSION_PCT)
                    .replace("{minPayout}", MIN_PAYOUT_RUB)}
                </li>
              ))}
            </ul>
            <p className="text-xs text-text-sec">{UI_TEXT.pages.terms.sections.pricingNote}</p>
          </Section>

          <Section title={UI_TEXT.pages.terms.sections.contactsTitle}>
            <p>
              {UI_TEXT.pages.terms.sections.contactsText
                .replace("{legal}", CONTACT_EMAILS.legal)
                .replace("{support}", CONTACT_EMAILS.support)}
            </p>
          </Section>
        </CardContent>
      </Card>
      </InfoPageLayout>
    </div>
  );
}

