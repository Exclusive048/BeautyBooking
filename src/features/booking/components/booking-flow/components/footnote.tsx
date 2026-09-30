import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.publicProfile.bookingWidget;

type Variant = "selection" | "form";

/**
 * Trailing micro-copy under the primary CTA.
 *
 * RKN-FIX-02: the form variant used to read «Нажимая, вы соглашаетесь с
 * условиями» — consent by conduct, which 152-ФЗ ст. 9 (ред. 156-ФЗ) made void
 * on 01.09.2025. Guests now give consent explicitly in the checkbox group above
 * the CTA, so this line no longer claims anything legal: it only tells people
 * how payment works.
 *
 * AUTH-GATE-01: the selection line used to promise an SMS confirmation the
 * product never sent; it describes the real behaviour instead.
 */
export function Footnote({ variant }: { variant: Variant }) {
  if (variant === "selection") {
    return (
      <p className="mt-2 text-center text-[11px] leading-relaxed text-text-sec">
        {T.footnoteSelectionConfirm}
        <br />
        {T.footnoteSelectionPay}
      </p>
    );
  }

  return (
    <p className="mt-2 text-center text-[11px] leading-relaxed text-text-sec">
      {T.footnoteFormPay}
    </p>
  );
}
