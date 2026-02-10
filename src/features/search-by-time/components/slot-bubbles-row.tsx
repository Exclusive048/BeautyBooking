import Link from "next/link";
import type { AvailabilitySlotPreview } from "@/lib/search-by-time/types";
import { moneyRUB } from "@/lib/format";

type Props = {
  providerUsername: string;
  serviceId?: string | null;
  slots: AvailabilitySlotPreview[];
};

function buildSlotHref(username: string, serviceId: string | null | undefined, slotStartAt: string): string {
  const params = new URLSearchParams();
  if (serviceId) params.set("serviceId", serviceId);
  if (slotStartAt) params.set("slotStartAt", slotStartAt);
  const suffix = params.toString();
  return suffix ? `/u/${username}?${suffix}` : `/u/${username}`;
}

function formatDiscount(slot: AvailabilitySlotPreview): string | null {
  if (!slot.discountType || typeof slot.discountValue !== "number") return null;
  if (slot.discountType === "PERCENT") {
    return `-${slot.discountValue}%`;
  }
  return `-${moneyRUB(slot.discountValue)}`;
}

export function SlotBubblesRow({ providerUsername, serviceId, slots }: Props) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {slots.map((slot) => {
        const discount = formatDiscount(slot);
        return (
          <Link
            key={slot.startAtUtc}
            href={buildSlotHref(providerUsername, serviceId, slot.startAtUtc)}
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
