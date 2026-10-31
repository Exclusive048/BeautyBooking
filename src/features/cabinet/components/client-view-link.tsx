import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  /** Адрес страницы мастера или студии; пока его нет — кнопки нет. */
  publicUsername: string | null;
};

/**
 * «Посмотреть глазами клиента» — публичная страница кабинета в новой вкладке.
 * Одна кнопка в шапках «Моей страницы» и «Настроек расписания» у мастера
 * и у студии. CABINET-COMPACT: на телефоне — только значок (подпись остаётся
 * доступным именем), иначе кнопка уходила под заголовок отдельной строкой.
 */
export function ClientViewLink({ publicUsername }: Props) {
  if (!publicUsername) return null;
  return (
    <Button asChild variant="secondary" size="md" className="rounded-xl max-sm:px-3">
      <Link
        href={`/u/${publicUsername}`}
        target="_blank"
        rel="noopener noreferrer"
        title={UI_TEXT.cabinet.clientView.cta}
      >
        <ExternalLink className="h-4 w-4 sm:mr-1.5" aria-hidden />
        <span className="max-sm:sr-only">{UI_TEXT.cabinet.clientView.cta}</span>
      </Link>
    </Button>
  );
}
