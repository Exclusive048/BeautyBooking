import { EmptyState } from "@/components/ui/empty-state";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * RES-28: колонка канбана переведена на общий `EmptyState`.
 *
 * Кнопки-действия здесь намеренно нет: колонка — это статус брони, и «создать
 * отменённую запись» смысла не имеет. Что действительно чинится — читаемость:
 * текст жил как `text-xs text-text-sec/60`, то есть 12 px при 60 % прозрачности
 * поверх и без того приглушённого токена.
 */
export function EmptyColumn() {
  return <EmptyState title={UI_TEXT.cabinetMaster.bookings.empty} className="py-8" />;
}
