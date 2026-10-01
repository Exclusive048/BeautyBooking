import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * PWA-FIX-10 — общая плитка показателя для всех кабинетов.
 *
 * 🔴 Зачем один примитив вместо двадцати локальных. Плитки показателей жили
 * отдельными реализациями в каждом разделе (мастер — 9, студия — 8, клиент — 2),
 * и они разошлись по трём осям разом: подпись то `text-xs`, то
 * `font-mono uppercase tracking-[0.18em]`; значение то `text-2xl`, то `text-xl`,
 * то `text-lg`; иконка то есть, то нет. Но дороже расхождения оказалась ОБЩАЯ у
 * всех черта: иконка занимала СВОЮ строку с отступом (`mb-2`/`mb-3`), то есть
 * ~36px вертикали на плитку не несли информации вовсе. На телефоне четыре плитки
 * в две колонки давали ~264px — больше трети экрана под четыре числа, и это
 * повторялось на дашборде, в расписании, в записях, у клиентов.
 *
 * Форма компактности здесь — не «уменьшить шрифт», а **убрать строку иконки**:
 * иконка уезжает в одну строку с подписью, где место всё равно пустовало.
 * Экономия ~40px на плитку (≈90px против ≈132px) без потери ни одного знака.
 *
 * ⚠️ Полностью унифицировать НЕ пытаемся: у аналитики свой тренд-бейдж, у
 * дашборда студии — дельта-пилюля, и загонять их в общий пропс значило бы
 * описывать типом три разные логики. Примитив владеет ровно тем, что у всех
 * одинаково, — оболочкой, строкой «иконка + подпись», строкой значения и
 * подписью под ним; остальное приходит слотами `badge` / `footer`.
 *
 * Радиус и отступы — дефолты: `className` вызывающего их перебивает (`cn` —
 * tailwind-merge). ⚠️ `sm:p-4` снимает только `sm:p-*` вызывающего.
 */

/**
 * UI-26/27: статусные акценты идут ТОЛЬКО токенами — сырые `amber-*` / `rose-*`
 * в новых статусных поверхностях запрещены, а тёмная тема встроена в переменные,
 * поэтому `dark:`-вилок здесь нет. Миграция как раз и убрала такие пары из
 * плиток уведомлений, офферов и клиентов.
 */
export type StatTileAccent = "neutral" | "primary" | "success" | "warning" | "danger";

const ACCENT_BORDER: Record<StatTileAccent, string> = {
  neutral: "",
  primary: "border-primary/30",
  success: "border-success-border",
  warning: "border-warning-border",
  danger: "border-danger-border",
};

const ACCENT_VALUE: Record<StatTileAccent, string> = {
  neutral: "text-text-main",
  primary: "text-accent-text",
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-danger-text",
};

export type StatTileProps = {
  /** Необязательна: часть поверхностей (аналитика) плитки без иконок. */
  icon?: LucideIcon;
  label: string;
  /**
   * Пояснение к подписи — `title`, то есть тултип на десктопе и long-press на
   * телефоне. Заведён под «Общая выручка», где подпись короче, чем смысл.
   */
  labelTooltip?: string;
  value: string;
  /** Единица отдельно от значения, чтобы не тянуть её в display-кегль: «%», «★». */
  unit?: string;
  sublabel?: ReactNode;
  /** Правый верхний слот строки подписи — дельта-пилюля. */
  badge?: ReactNode;
  /** Слот под значением — тренд-строка аналитики. */
  footer?: ReactNode;
  accent?: StatTileAccent;
  className?: string;
  /**
   * PWA-UX-BATCH-01: плотная форма для сетки в ЧЕТЫРЕ колонки на телефоне
   * (`StatTileGrid mobileColumns={4}`): ниже `sm` иконка скрыта, отступ и
   * кегль значения меньше — иначе четыре плитки по ~80px не вмещают ни
   * подпись, ни число. С `sm` — обычная плитка.
   */
  compact?: boolean;
  /**
   * Короткая подпись ниже `sm` в compact-форме: четыре плитки по ~85px не
   * вмещают «Записей на неделе» — в живом прогоне PWA-UX-BATCH-01 подпись
   * обрезалась до «Записей на не…». С `sm` — полная `label`.
   */
  labelCompact?: string;
  /** Короткое значение ниже `sm` в compact-форме: «20» вместо «20 око…». */
  valueCompact?: string;
};

export function StatTile({
  icon: Icon,
  label,
  labelTooltip,
  value,
  unit,
  sublabel,
  badge,
  footer,
  accent = "neutral",
  className,
  compact = false,
  labelCompact,
  valueCompact,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "border border-border-subtle bg-bg-card",
        ACCENT_BORDER[accent],
        "rounded-2xl",
        compact ? "p-2 sm:p-4" : "p-3 sm:p-4",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        {Icon ? (
          <span
            aria-hidden
            className={cn(
              "h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/10 text-accent-text sm:h-7 sm:w-7",
              compact ? "hidden sm:grid" : "grid",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : null}
        <p
          title={labelTooltip}
          className={cn(
            "min-w-0 flex-1 truncate text-text-sec sm:text-xs",
            compact ? "text-3xs" : "text-2xs",
            // `leading-*` — после размера шрифта: `cn` (tailwind-merge) выбрасывает
            // ранний `leading-*`, если позже стоит размер (он задаёт и высоту строки).
            "leading-tight",
            labelTooltip &&
              "cursor-help decoration-text-sec/30 decoration-dotted underline-offset-2 hover:underline",
          )}
        >
          {compact && labelCompact ? (
            <>
              <span className="sm:hidden">{labelCompact}</span>
              <span className="hidden sm:inline">{label}</span>
            </>
          ) : (
            label
          )}
        </p>
        {badge ? <span className="shrink-0">{badge}</span> : null}
      </div>

      <p className={cn("flex items-baseline gap-1", compact ? "mt-1" : "mt-1.5")}>
        <span
          className={cn(
            "truncate font-display tabular-nums sm:text-2xl",
            compact ? "text-base" : "text-xl",
            "leading-tight",
            ACCENT_VALUE[accent],
          )}
        >
          {compact && valueCompact ? (
            <>
              <span className="sm:hidden">{valueCompact}</span>
              <span className="hidden sm:inline">{value}</span>
            </>
          ) : (
            value
          )}
        </span>
        {unit ? <span className="text-xs text-text-sec sm:text-sm">{unit}</span> : null}
      </p>

      {sublabel ? (
        <p className="mt-0.5 truncate text-2xs leading-tight text-text-sec">{sublabel}</p>
      ) : null}

      {footer ? <div className="mt-1">{footer}</div> : null}
    </div>
  );
}

/**
 * Сетка плиток. Заведена рядом с примитивом, потому что «сколько колонок на
 * каком брейкпоинте» — тоже расходившееся решение: встречались
 * `gap-3 lg:grid-cols-4`, `md:grid-cols-4`, `md:grid-cols-3 lg:grid-cols-5`.
 * На мобильном всегда две колонки: одна растягивает число на всю ширину и
 * съедает вертикаль, три — обрезают подписи.
 */
const GRID_COLUMNS: Record<3 | 4 | 5, string> = {
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-3 lg:grid-cols-5",
};

const MOBILE_GRID_COLUMNS: Record<2 | 4, string> = {
  2: "grid-cols-2 gap-2",
  // PWA-UX-BATCH-01: четыре плитки в одну строку на телефоне — только вместе
  // с `compact` у плиток; зазор у́же, иначе плитки по 76px.
  4: "grid-cols-4 gap-1.5",
};

export function StatTileGrid({
  columns = 4,
  mobileColumns = 2,
  children,
  className,
}: {
  /** Колонки на широком экране. */
  columns?: 3 | 4 | 5;
  /** Колонки ниже `sm`: по умолчанию 2; 4 — одна строка (плитки — `compact`). */
  mobileColumns?: 2 | 4;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("grid sm:gap-3", MOBILE_GRID_COLUMNS[mobileColumns], GRID_COLUMNS[columns], className)}
    >
      {children}
    </div>
  );
}
