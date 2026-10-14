/**
 * HELP-GUIDE-01 — общая форма ответа базы знаний (/help), публичного FAQ
 * (/faq) и FAQ кабинета клиента (/cabinet/faq): короткий ответ, по желанию —
 * шаги «что нажать» и снимки экрана (превью, по нажатию — во весь экран).
 *
 * Снимки лежат в `public/help/<имя>.webp`; снимает их `.qa/help-screenshots.spec.ts`
 * (телефон, showcase-аккаунты). Имя без пути и расширения — `shot("master-services", …)`.
 * Модуль без React и без server-only: его читают и серверные страницы, и
 * клиентский FAQ кабинета.
 */

export type HelpShot = {
  /** Путь от корня сайта: `/help/<имя>.webp`. */
  src: string;
  /** Подпись под превью и в просмотре: что на снимке. */
  caption: string;
};

export type HelpAnswerContent = {
  /** Ответ одним абзацем — он же текст для JSON-LD и поиска. */
  answer: string;
  /** Шаги «что нажать» — нумерованным списком под ответом. */
  steps?: readonly string[];
  shots?: readonly HelpShot[];
};

/** Снимок из `public/help/<name>.webp`. */
export function shot(name: string, caption: string): HelpShot {
  return { src: `/help/${name}.webp`, caption };
}

/**
 * Ответ одной строкой — для разметки FAQPage (поисковики читают только
 * текст) и для поиска по FAQ: шаги дописываются нумерованными предложениями.
 */
export function plainAnswer(content: HelpAnswerContent): string {
  if (!content.steps?.length) return content.answer;
  const steps = content.steps.map((step, index) => `${index + 1}. ${step}`).join(" ");
  return `${content.answer} ${steps}`;
}
