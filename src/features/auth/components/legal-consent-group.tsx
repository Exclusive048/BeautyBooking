"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/cn";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import type { ConsentFlags } from "@/lib/legal/consent-flags";
import * as UI_TEXT from "@/lib/ui/text";

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
  /**
   * RKN-FIX-02 — booking-widget density. Same three purposes, same wording, same
   * hit targets; tighter padding and 11px type so the group fits a 380 px
   * sidebar without pushing the CTA below the fold. Legal content is never what
   * gets compacted.
   */
  compact?: boolean;
  /**
   * LOGIN-TILES-01 — способ входа нажат без обязательных согласий: рамка
   * блока и метки «обязательно» у неотмеченных строк окрашиваются, а сами
   * поля получают `aria-invalid`. Текст подсказки рендерит вызывающий и
   * передаёт её `id` в `describedBy`.
   */
  invalid?: boolean;
  describedBy?: string;
  /** Рост числа — блок вздрагивает один раз (`0` — покой), как `OtpInput`. */
  shakeSignal?: number;
};

const T = UI_TEXT.legal.consent;

const LINK_CLASS =
  "rounded-sm text-text-main underline underline-offset-4 decoration-dotted transition hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function ConsentRow({
  checked,
  onCheckedChange,
  required,
  compact,
  invalid,
  children,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  required?: boolean;
  compact?: boolean;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  const inputId = useId();
  const missing = Boolean(invalid && required && !checked);
  return (
    <div className={cn("flex items-start gap-3 px-3", compact ? "py-2" : "py-2.5")}>
      <Checkbox
        id={inputId}
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        aria-invalid={missing || undefined}
        className="mt-0.5"
      />
      <label htmlFor={inputId} className="cursor-pointer leading-relaxed">
        {children}
        {/* Own line, not trailing the sentence: a two-line label wrapped the
            marker onto a third line by itself, which read as a stray word.
            Required-vs-optional has to be legible at a glance anyway — the law
            cares that the marketing box is visibly not a condition. */}
        <span
          className={cn(
            "mt-1 block eyebrow",
            missing ? "text-danger-text" : required ? "text-accent-text/80" : "text-text-sec/60",
          )}
        >
          {required ? T.requiredMark : T.optionalMark}
        </span>
      </label>
    </div>
  );
}

export function LegalConsentGroup({
  value,
  onChange,
  className,
  compact,
  invalid,
  describedBy,
  shakeSignal = 0,
}: LegalConsentGroupProps) {
  const groupRef = useRef<HTMLDivElement>(null);

  // Перезапуск CSS-анимации: снять класс, принудительно пересчитать раскладку,
  // вернуть. Тот же приём, что у сетки кода (`OtpInput`); сама анимация
  // объявлена только под `prefers-reduced-motion: no-preference`.
  useEffect(() => {
    if (shakeSignal <= 0) return;
    const el = groupRef.current;
    if (!el) return;
    el.classList.remove("login-shake");
    el.getBoundingClientRect();
    el.classList.add("login-shake");
    const clear = () => el.classList.remove("login-shake");
    el.addEventListener("animationend", clear, { once: true });
    return () => el.removeEventListener("animationend", clear);
  }, [shakeSignal]);

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={T.groupLabel}
      aria-describedby={describedBy}
      className={cn(
        "divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-bg-input/70 text-text-sec transition-[border-color,box-shadow] duration-200",
        invalid && "border-primary-magenta/70 ring-4 ring-primary-magenta/15",
        compact ? "text-2xs leading-relaxed" : "text-xs",
        className,
      )}
    >
      <ConsentRow
        required
        compact={compact}
        invalid={invalid}
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
        compact={compact}
        invalid={invalid}
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
        compact={compact}
        checked={value.marketing}
        onCheckedChange={(marketing) => onChange({ ...value, marketing })}
      >
        {T.marketingLabel}
      </ConsentRow>
    </div>
  );
}
