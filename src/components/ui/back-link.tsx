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
 */
export function BackLink({ href, className }: Props) {
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={cn("-ml-2 gap-1 rounded-xl px-2 text-text-sec hover:text-text-main", className)}
    >
      <Link href={href}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {UI_TEXT.actions.back}
      </Link>
    </Button>
  );
}
