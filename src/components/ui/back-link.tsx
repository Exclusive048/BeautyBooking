import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  /** Родительский экран — ссылка, а не `history.back()`: страницу открывают и по прямой ссылке. */
  href: string;
  className?: string;
};

/**
 * «Назад» к родительскому экрану. В установленном приложении (PWA) кнопки
 * «Назад» браузера нет, а крошки в шапке мелкие и на телефоне неудобны —
 * экран, на который ведёт кнопка из другого раздела («Настроить расписание»),
 * должен уметь вернуть обратно сам.
 *
 * BACK-BUTTON-01: круглая кнопка 40px со стрелкой, в одну строку с заголовком
 * экрана (`PageTitleRow`) — как «назад» в приложениях. Прежняя мелкая
 * текстовая ссылка 14px над заголовком выглядела чужой и плохо попадала под
 * палец. Подпись «Назад» — у экранного диктора и во всплывающей подсказке.
 */
export function BackLink({ href, className }: Props) {
  return (
    <Button
      asChild
      variant="icon"
      size="icon"
      className={cn("shrink-0 rounded-full bg-bg-card text-text-main", className)}
    >
      <Link href={href} aria-label={UI_TEXT.actions.back} title={UI_TEXT.actions.back}>
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </Link>
    </Button>
  );
}

/**
 * Строка «Назад + заголовок экрана»: кнопка слева, заголовок рядом, по центру
 * строки. Без `backHref` — только заголовок.
 */
export function PageTitleRow({
  backHref,
  children,
  className,
}: {
  backHref?: string;
  children: ReactNode;
  className?: string;
}) {
  if (!backHref) return <>{children}</>;
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <BackLink href={backHref} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
