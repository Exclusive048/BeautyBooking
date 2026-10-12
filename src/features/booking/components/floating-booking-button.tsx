"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Props = {
  label: string;
  onClick: () => void;
  /**
   * На ПК — плашка справа внизу. Нужна странице студии: у неё нет своей
   * колонки записи. У мастера на ПК запись — в правой колонке, кнопка там
   * лишняя.
   */
  showOnDesktop?: boolean;
};

/**
 * BOOKING-WIDGET-DIALOG — плавающая «Записаться» публичных страниц мастера и
 * студии: открывает окно записи с первого шага.
 *
 * PUBLIC-PROFILE-FIXED-CTA-UNDER-BOTTOM-NAV (2026-09-24): на телефоне кнопка
 * стоит НАД глобальной нижней навигацией (`--bottom-nav-h` публикует
 * `BottomTabBar`), а не под ней — иначе тап по её центру попадал во вкладку.
 * Запасное значение — та же формула высоты панели, что у `BottomTabBarSpacer`:
 * до гидратации кнопка не прыгает. Safe-area забирает сама панель.
 */
export function FloatingBookingButton({ label, onClick, showOnDesktop = false }: Props) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[var(--bottom-nav-h,calc(3rem+max(0px,calc(env(safe-area-inset-bottom,0px)-10px))))] z-float",
        showOnDesktop ? "lg:inset-x-auto lg:bottom-6 lg:right-6" : "lg:hidden",
      )}
    >
      <div className="mx-4 mb-3 lg:m-0">
        <Button
          variant="primary"
          size="lg"
          onClick={onClick}
          className="h-14 w-full px-6 font-semibold shadow-hover motion-reduce:active:scale-100 lg:h-12 lg:w-auto lg:rounded-full lg:px-7"
        >
          {label}
        </Button>
      </div>
    </div>
  );
}
