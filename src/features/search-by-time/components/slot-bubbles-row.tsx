import Link from "next/link";
import type { AvailabilitySlotPreview } from "@/lib/search-by-time/types";
import { hotSlotFixedDiscountKopeks } from "@/lib/hot-slots/pricing";
import { UI_FMT } from "@/lib/ui/fmt";
import { providerPublicUrl, withQuery } from "@/lib/public-urls";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  provider: { id: string; publicUsername: string | null };
  serviceId?: string | null;
  slots: AvailabilitySlotPreview[];
};

function buildSlotHref(
  provider: { id: string; publicUsername: string | null },
  serviceId: string | null | undefined,
  slotStartAt: string
): string {
  const base = providerPublicUrl(provider, "slot-bubbles-row");
  if (!base) return "#";
  return withQuery(base, {
    serviceId: serviceId || undefined,
    slotStartAt: slotStartAt || undefined,
  });
}

function formatDiscount(slot: AvailabilitySlotPreview): string | null {
  if (!slot.discountType || typeof slot.discountValue !== "number") return null;
  if (slot.discountType === "PERCENT") {
    return `-${slot.discountValue}%`;
  }
  // HOT-SLOT-FIXED-UNIT: FIXED `discountValue` of a hot slot is in RUBLES (the
  // rule is entered in ₽; SLOT-DISCOUNT-100X read it as kopeks only because the
  // pricing then subtracted the raw value from a kopeks price — that was the bug,
  // fixed in `hot-slots/pricing.ts`). Same ₽→kopeks step the pricing uses, then
  // the canonical ÷100 label — matches `originalPrice − discountedPrice`.
  return `-${UI_FMT.priceLabel(hotSlotFixedDiscountKopeks(slot.discountValue))}`;
}

export function SlotBubblesRow({ provider, serviceId, slots }: Props) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {slots.map((slot) => {
        const discount = formatDiscount(slot);
        return (
          <Link
            key={slot.startAtUtc}
            href={buildSlotHref(provider, serviceId, slot.startAtUtc)}
            className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-bg-card/65 px-3 py-1 text-xs font-medium text-text-main transition hover:bg-bg-card"
            aria-label={UI_TEXT.a11y.bookAtSlot(slot.label)}
          >
            <span>{slot.label}</span>
            {discount ? <span className="text-3xs text-success-text">{discount}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
