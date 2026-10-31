import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UI_FMT } from "@/lib/ui/fmt";

export type AttentionSummaryItem = {
  id: string;
  icon: LucideIcon;
  label: string;
  /** Сколько ждёт; `null` — пункт без счётчика (дата уже в подписи). */
  count: number | null;
  href: string;
  /** Ждёт решения со сроком — счётчик и значок подсвечиваются. */
  urgent?: boolean;
};

type Props = {
  title: string;
  emptyLabel: string;
  /** Только пункты, где что-то ждёт: пустые вызывающий не передаёт. */
  items: AttentionSummaryItem[];
};

/**
 * DASHBOARD-REORDER (запрос владельца 2026-10-31) — «Требуют внимания» на
 * главной кабинетов мастера и студии: что ждёт действия, сгруппировано —
 * сколько записей ждут подтверждения, сколько новых сообщений, отзывов без
 * ответа, заявок на график. Без деталей отдельных записей: строка ведёт туда,
 * где это разбирают.
 */
export function AttentionSummary({ title, emptyLabel, items }: Props) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card" data-testid="attention-summary">
      <h2 className="px-4 pb-2 pt-4 font-display text-lg text-text-main md:px-5">{title}</h2>
      {items.length > 0 ? (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-input/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 md:px-5"
                >
                  <span
                    aria-hidden
                    className={
                      item.urgent
                        ? "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning-text"
                        : "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-accent-text"
                    }
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text-main">{item.label}</span>
                  {item.count !== null ? (
                    <Badge size="xs" variant={item.urgent ? "warning" : "default"} className="tabular-nums">
                      {UI_FMT.count(item.count)}
                    </Badge>
                  ) : null}
                  <ChevronRight className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 px-4 pb-4 text-sm text-text-sec md:px-5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success-text" aria-hidden />
          {emptyLabel}
        </p>
      )}
    </section>
  );
}
