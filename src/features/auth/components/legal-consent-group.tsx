"use client";

import Link from "next/link";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import type { ConsentFlags } from "@/lib/legal/consent-flags";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * RKN-FIX-01 — consent, split by purpose.
 *
 * Replaces `LegalConsentCheckbox`, whose single box bundled the offer, the
 * privacy policy and PD-processing consent into one act. Since 01.09.2025
 * (152-ФЗ ст. 9 в ред. 156-ФЗ) each purpose needs its own separate consent
 * against its own document, marketing consent is separate AND optional, and
 * pre-ticked boxes are void — hence three independent, always-unchecked rows
 * whose state is owned by the caller.
 *
 * Visual language follows LOGIN-WOW-01: the same soft input-surface plate the
 * old single box used, now a `divide-y` stack so the three purposes read as
 * distinct commitments rather than one paragraph of small print.
 */

type LegalConsentGroupProps = {
  value: ConsentFlags;
  onChange: (next: ConsentFlags) => void;
  className?: string;
};

const T = UI_TEXT.legal.consent;

const LINK_CLASS =
  "rounded-sm text-text-main underline underline-offset-4 decoration-dotted transition hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function ConsentRow({
  checked,
  onCheckedChange,
  required,
  children,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  required?: boolean;
  children: React.ReactNode;
}) {
  const inputId = useId();
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border border-border-subtle bg-bg-card accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      <label htmlFor={inputId} className="cursor-pointer leading-relaxed">
        {children}
        {/* Own line, not trailing the sentence: a two-line label wrapped the
            marker onto a third line by itself, which read as a stray word.
            Required-vs-optional has to be legible at a glance anyway — the law
            cares that the marketing box is visibly not a condition. */}
        <span
          className={cn(
            "mt-1 block font-mono text-[10px] uppercase tracking-[0.08em]",
            required ? "text-accent-text/80" : "text-text-sec/60",
          )}
        >
          {required ? T.requiredMark : T.optionalMark}
        </span>
      </label>
    </div>
  );
}

export function LegalConsentGroup({ value, onChange, className }: LegalConsentGroupProps) {
  return (
    <div
      role="group"
      aria-label={T.groupLabel}
      className={cn(
        "divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-bg-input/70 text-xs text-text-sec",
        className,
      )}
    >
      <ConsentRow
        required
        checked={value.terms}
        onCheckedChange={(terms) => onChange({ ...value, terms })}
      >
        {T.termsPrefix}{" "}
        <Link href={LEGAL_DOCUMENTS.TERMS.href} className={LINK_CLASS}>
          {T.termsLink}
        </Link>
      </ConsentRow>

      <ConsentRow
        required
        checked={value.pdProcessing}
        onCheckedChange={(pdProcessing) => onChange({ ...value, pdProcessing })}
      >
        {T.pdPrefix}{" "}
        {/* The PD consent points at its OWN document, never at the privacy
            policy — the policy is informational and is linked separately. */}
        <Link href={LEGAL_DOCUMENTS.PD_CONSENT.href} className={LINK_CLASS}>
          {T.pdLink}
        </Link>{" "}
        {T.pdMiddle}{" "}
        <Link href={LEGAL_DOCUMENTS.PRIVACY.href} className={LINK_CLASS}>
          {T.privacyLink}
        </Link>
      </ConsentRow>

      <ConsentRow
        checked={value.marketing}
        onCheckedChange={(marketing) => onChange({ ...value, marketing })}
      >
        {T.marketingLabel}
      </ConsentRow>
    </div>
  );
}
