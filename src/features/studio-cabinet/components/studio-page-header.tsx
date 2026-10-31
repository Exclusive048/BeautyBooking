import type { ReactNode } from "react";
import { PageTitleRow } from "@/components/ui/back-link";

type Props = {
  /** «Бровь» над заголовком — раздел и счётчики («Команда · 7 мастеров»). */
  caption?: ReactNode;
  title: ReactNode;
  /**
   * Строка под заголовком — только факт о данных (счётчики, окно CRM), не
   * описание раздела: «что здесь можно делать» видно по самому экрану, а на
   * телефоне две строки пояснения сдвигали содержимое на полэкрана.
   */
  note?: ReactNode;
  /** Кнопки справа от заголовка. */
  actions?: ReactNode;
  /** Родительский экран — круглая «Назад» слева от заголовка (BACK-BUTTON-01). */
  backHref?: string;
};

/**
 * CABINET-COMPACT — шапка страниц кабинета студии. Заголовок и действие в
 * одну строку и на телефоне: блок заголовка растёт с базой `auto`
 * (`flex-[1_1_auto]`), поэтому кнопка уходит на следующую строку, только
 * когда рядом не помещается, и не сжимает заголовок до многоточия.
 */
export function StudioPageHeader({ caption, title, note, actions, backHref }: Props) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="min-w-0 flex-[1_1_auto]">
        <PageTitleRow backHref={backHref}>
          {caption ? <p className="mb-0.5 eyebrow">{caption}</p> : null}
          <h1 className="font-display text-xl font-bold tracking-tight text-text-main sm:text-2xl md:text-3xl">
            {title}
          </h1>
        </PageTitleRow>
        {note ? <p className="mt-0.5 text-xs text-text-sec sm:text-sm">{note}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
