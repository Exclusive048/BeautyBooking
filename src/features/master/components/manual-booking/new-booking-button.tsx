"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useManualBooking } from "@/features/master/components/manual-booking/manual-booking-provider";

type Props = {
  label: string;
  className?: string;
  variant?: "primary" | "secondary";
  /**
   * PWA-FIX-05 — ниже `md` кнопка сворачивается до квадратного «+» (подпись
   * уходит в `aria-label`/`title`), с `md` — прежний «+ Новая запись». Нужна
   * там, где в строке действий стоят ещё кнопки и подписи всех не помещаются
   * (шапка расписания на телефоне: подпись отдана входу в настройки, а «+»
   * на красной кнопке читается без слов). Две DOM-ноды, а не одна со
   * скрытой подписью: `size` задаёт `px-*`/`w-*`, и переключать их через
   * className нельзя — `cn` не разрешает конфликты (CN-CONFLICT-CLASS).
   */
  compactBelowMd?: boolean;
};

/**
 * "+ Новая запись" button (fix-01). Opens the modal **inline** on the
 * current route via the layout-level `ManualBookingProvider` —
 * replaces the legacy `<Link href="/cabinet/master/dashboard?manual=1">`
 * which silently navigated to the dashboard regardless of where the
 * user clicked.
 */
export function NewBookingButton({
  label,
  className,
  variant = "primary",
  compactBelowMd = false,
}: Props) {
  const { open, enabled } = useManualBooking();
  const full = (
    <Button
      type="button"
      variant={variant}
      size="md"
      className={cn(compactBelowMd ? "hidden md:inline-flex" : undefined, className)}
      onClick={() => open()}
      disabled={!enabled}
    >
      <Plus className="mr-1.5 h-4 w-4" aria-hidden />
      {label}
    </Button>
  );
  if (!compactBelowMd) return full;
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="none"
        className={cn("h-11 w-11 shrink-0 p-0 md:hidden", className)}
        onClick={() => open()}
        disabled={!enabled}
        aria-label={label}
        title={label}
      >
        <Plus className="h-5 w-5" aria-hidden />
      </Button>
      {full}
    </>
  );
}
