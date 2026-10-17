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
 * и у студии.
 */
export function ClientViewLink({ publicUsername }: Props) {
  if (!publicUsername) return null;
  return (
    <Button asChild variant="secondary" size="md" className="rounded-xl">
      <Link href={`/u/${publicUsername}`} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden />
        {UI_TEXT.cabinet.clientView.cta}
      </Link>
    </Button>
  );
}
