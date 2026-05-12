import Link from "next/link";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.publicProfile.bookingWidget;

type Variant = "selection" | "form";

/**
 * Trailing micro-copy under the primary CTA. Selection phase
 * highlights SMS confirmation + pay-on-site; form phase adds the
 * terms-acceptance clause (no checkbox — the act of pressing the
 * button counts).
 */
export function Footnote({ variant }: { variant: Variant }) {
  if (variant === "selection") {
    return (
      <p className="mt-2 text-center text-[11px] leading-relaxed text-text-sec">
        {T.footnoteSelectionSms}
        <br />
        {T.footnoteSelectionPay}
      </p>
    );
  }

  return (
    <p className="mt-2 text-center text-[11px] leading-relaxed text-text-sec">
      {T.footnoteFormPrefix}{" "}
      <Link href="/terms" className="underline transition hover:text-text-main">
        {T.footnoteFormTermsLink}
      </Link>
    </p>
  );
}
