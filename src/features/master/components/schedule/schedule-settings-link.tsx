import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.schedule.controls;

/**
 * PWA-FIX-04 — вход в настройки расписания С САМОЙ страницы расписания.
 *
 * На телефоне сайдбара нет: до PWA-FIX-04 единственным входом с мобильного
 * была условная ссылка в блоке «Требует внимания» на дашборде, то есть мастер,
 * открывший «Расписание» в PWA, настроить его не мог.
 *
 * PWA-FIX-05 — у кнопки появилась ПОДПИСЬ. Иконка-слайдеры без текста ничего
 * не говорила мастеру, открывшему кабинет впервые (замечание владельца из PWA:
 * «маленькая, люди не поймут, что там настраивать расписание»): «настроить
 * расписание» надо прочитать, а не угадать. Подпись — CTA-инфинитив, потому что
 * это действие со страницы, а не пункт навигации. На телефоне кнопка занимает
 * свободную ширину строки действий (`flex-1`), на ≥sm — ширину по содержимому;
 * на десктопе соседний пункт сайдбара дублируется осознанно — одинаковый вход
 * на обоих носителях важнее экономии одной кнопки. Серверный компонент: ни
 * состояния, ни обработчиков.
 */
export function ScheduleSettingsLink() {
  return (
    <Button asChild variant="secondary" size="md" className="flex-1 rounded-xl sm:flex-none">
      <Link href="/cabinet/master/schedule/settings">
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        {T.settings}
      </Link>
    </Button>
  );
}
