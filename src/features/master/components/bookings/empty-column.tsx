import { UI_TEXT } from "@/lib/ui/text";

export function EmptyColumn() {
  return (
    <div className="py-8 text-center">
      <p className="text-xs text-text-sec/60">
        {UI_TEXT.cabinetMaster.bookings.empty}
      </p>
    </div>
  );
}
