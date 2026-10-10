import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * FIELD-LABEL-01 — подпись над полем формы, одна на весь продукт.
 *
 * Зазор между подписью и полем — 8px (`mb-2`) везде. До примитива каждая
 * форма собирала подпись сама (`mb-1`, `mb-1.5`, `mt-1.5` у обёртки поля,
 * `gap-1`/`gap-1.5`), и зазор плавал 4–8px; при 4px ореол фокуса поля ложился
 * прямо на подпись («Название» в новой услуге, «Имя клиента» в ручной записи —
 * замечание владельца 2026-10-10).
 *
 * С `htmlFor` рендерится `<label>` (поле связано по id); без него — `<span>`,
 * который кладут ВНУТРЬ оборачивающего `<label>` вместе с полем (вложенный
 * `<label>` недопустим). Тон — типографика поверхности: `default` — кабинеты,
 * `muted` — админка, `eyebrow` — «бровь» (моно, прописные). Размер и цвет
 * вызывающего побеждают (`cn`), зазор — нет: подпись с другим отступом —
 * это и есть разнобой, который примитив закрывает.
 */
export type FieldLabelTone = "default" | "muted" | "eyebrow";

const TONE_CLASSES: Record<FieldLabelTone, string> = {
  default: "text-xs font-medium text-text-main",
  muted: "text-xs font-medium text-text-sec",
  eyebrow: "eyebrow",
};

type Props = {
  children: ReactNode;
  /** id поля; с ним подпись — `<label>`, без него — `<span>` внутри `<label>`. */
  htmlFor?: string;
  id?: string;
  tone?: FieldLabelTone;
  /** Только типографика (размер, цвет). Отступ задаёт примитив. */
  className?: string;
};

export function FieldLabel({ children, htmlFor, id, tone = "default", className }: Props) {
  const classes = cn("block", TONE_CLASSES[tone], className, "mb-2");
  if (htmlFor) {
    return (
      <label htmlFor={htmlFor} id={id} className={classes}>
        {children}
      </label>
    );
  }
  return (
    <span id={id} className={classes}>
      {children}
    </span>
  );
}
