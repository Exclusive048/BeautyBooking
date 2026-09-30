import { Building2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BookingWorkContext } from "@/lib/bookings/work-context";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.workContext;

/** Полная подпись контекста — для списков, подсказок и экранных читалок. */
export function workContextLabel(context: BookingWorkContext): string {
  if (context.kind === "PERSONAL") return T.personal;
  return context.studioName ? T.studioTemplate.replace("{name}", context.studioName) : T.studioShort;
}

type Props = {
  context: BookingWorkContext;
  /**
   * `badge` — самостоятельная пилюля (строки главной, карточки канбана):
   * студия — `info`, личная — нейтральная.
   * `inline` — внутри карточки сетки расписания: без своей заливки, в цвет
   * карточки, потому что фон у неё свой на каждый статус (бренд, «ожидает»,
   * «новый клиент») и чужая пилюля на нём спорила бы со статусом.
   */
  variant?: "badge" | "inline";
  /** Для `inline`: только иконка (узкая колонка недели) или иконка с полной подписью (день). */
  showLabel?: boolean;
};

/**
 * STUDIO-MASTER-PROFILES (этап 3): пометка «Личная запись» / «Студия «…»» на
 * записи мастера, который работает и лично, и в студии. Рендерится только
 * там, где вызывающий решил её показать (`shouldShowWorkContext`).
 */
export function WorkContextBadge({ context, variant = "badge", showLabel = true }: Props) {
  const Icon = context.kind === "STUDIO" ? Building2 : UserRound;
  const label = workContextLabel(context);

  if (variant === "inline") {
    return (
      <span
        className="inline-flex min-w-0 items-center gap-1"
        title={label}
        aria-label={showLabel ? undefined : label}
        role={showLabel ? undefined : "img"}
      >
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        {showLabel ? <span className="truncate">{label}</span> : null}
      </span>
    );
  }

  return (
    <Badge
      variant={context.kind === "STUDIO" ? "info" : "default"}
      className="min-w-0 max-w-full gap-1 px-2 py-0.5 leading-tight"
      title={label}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </Badge>
  );
}
