import Link from "next/link";
import type { AvailabilitySlotPreview } from "@/lib/search-by-time/types";
import { UI_FMT } from "@/lib/ui/fmt";
import { providerPublicUrl, withQuery } from "@/lib/public-urls";

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
  // FIXED `discountValue` is in KOPEKS (the hot-slot pricing subtracts it from a
  // kopeks price: `base − value`). The legacy `moneyRUB` (no ÷100) showed it 100×
  // too large — SLOT-DISCOUNT-100X. Route through the canonical ÷100 ₽ boundary so
  // the label matches the actual applied discount (`originalPrice − discountedPrice`).
  return `-${UI_FMT.priceLabel(slot.discountValue)}`;
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
            aria-label={`Записаться на ${slot.label}`}
          >
            <span>{slot.label}</span>
            {discount ? <span className="text-[10px] text-emerald-400">{discount}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
