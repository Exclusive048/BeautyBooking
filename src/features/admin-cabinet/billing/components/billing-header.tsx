import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.adminPanel.billing.header;

/** Caption strip "Финансы и тарифы". Spec deliberately omits any
 * right-side CTA — neither export nor "create plan" is in scope for
 * ADMIN-BILLING-A. */
export function BillingHeader() {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-sec">
      {T.caption}
    </p>
  );
}
