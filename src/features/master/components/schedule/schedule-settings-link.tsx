import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.nav.items;

/**
 * PWA-FIX-04 — вход в настройки расписания С САМОЙ страницы расписания.
 *
 * На десктопе «Настройки расписания» — соседний пункт сайдбара, и отдельная
 * кнопка была бы дублем. На телефоне сайдбара нет: до этого фикса единственным
 * входом с мобильного была условная ссылка в блоке «Требует внимания» на
 * дашборде, то есть мастер, открывший «Расписание» в PWA, настроить его не мог.
 * Иконка-ссылка стоит рядом с «Обновить» и повторяет его форму (`h-9 w-9`);
 * подпись — та же, что у пункта навигации, чтобы раздел назывался одинаково.
 * Серверный компонент: ни состояния, ни обработчиков.
 */
export function ScheduleSettingsLink() {
  return (
    <Button asChild variant="secondary" size="icon" className="h-9 w-9 rounded-xl">
      <Link
        href="/cabinet/master/schedule/settings"
        aria-label={T.scheduleSettings}
        title={T.scheduleSettings}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
      </Link>
    </Button>
  );
}
