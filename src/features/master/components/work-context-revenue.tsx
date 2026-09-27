import type { RevenueSplit } from "@/lib/bookings/work-context";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.workContext;

/**
 * STUDIO-MASTER-PROFILES (этап 3): подпись плитки выручки «личные X · студия Y».
 * Студийная сумма — оборот студии по записям мастера, а не его доход, поэтому
 * они показываются раздельно, а не одной цифрой.
 *
 * Только от `sm`: в плитке 4-в-ряд на телефоне (~85 px) строка обрезалась бы
 * многоточием и теряла ровно ту половину, ради которой выведена; там остаётся
 * итог.
 */
export function WorkContextRevenueSplit({ split }: { split: RevenueSplit }) {
  return (
    <span className="hidden sm:inline">
      {T.revenueSplitTemplate
        .replace("{personal}", UI_FMT.priceLabel(split.personal))
        .replace("{studio}", UI_FMT.priceLabel(split.studio))}
    </span>
  );
}
