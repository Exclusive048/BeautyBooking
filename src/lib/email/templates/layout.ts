import { BRAND_COLORS, brandGradientCss, withAlpha } from "@/lib/ui/brand-colors";

/**
 * EMAIL-DARK-01 — общий каркас транзакционного письма (код входа + уведомления).
 *
 * 🔴 Почему письмо «блеклое и розоватое» в тёмной теме. Шаблоны были чисто
 * светлыми и никак не объявляли поддержку тёмной темы, поэтому почтовик
 * перекрашивал их сам. Яндекс Почта (основной клиент нашей аудитории) делает
 * это формулой `(h, s, l) → (h, s, 1 − l)` над ИНЛАЙНОВЫМИ `color` /
 * `background-color` / `border-color`: оттенок и насыщенность сохраняются,
 * инвертируется только яркость. Бордовые цифры кода (#720808) становились
 * лососево-розовыми, бордово-чёрный текст — бледно-розовым, мововый вторичный
 * — серо-розовым почти без контраста на почти чёрной карточке. Mail.ru, Gmail
 * на Android и Outlook на телефоне инвертируют похожим образом.
 *
 * Три слоя, от надёжного к прогрессивному:
 *   1. Инлайновые светлые цвета — база для клиентов, вырезающих `<style>`.
 *      Внешний вид светлой темы не изменён.
 *   2. Те же светлые цвета классами с `!important` в `<style>`. Перекрашивание
 *      по инлайн-стилям их не трогает (Яндекс явно обрабатывает только
 *      `style="…"`), а `!important` из таблицы стилей побеждает инлайн — то
 *      есть вместо розовой каши письмо остаётся таким, каким оно задумано.
 *   3. `@media (prefers-color-scheme: dark)` — собственная тёмная версия на
 *      тёмных токенах продукта (Apple Mail, Mail.ru, Outlook, вебвью почтовых
 *      приложений, отдающие тему). Объявлена ПОСЛЕ слоя 2 той же специфичности,
 *      поэтому в тёмной теме побеждает она. Мета `color-scheme` заодно говорит
 *      Apple Mail не включать собственную инверсию.
 *
 * Шапка на бренд-градиенте в перекраске не нуждается ни в одной теме: фон уже
 * тёмный, текст уже светлый — инверторы такие элементы пропускают по порогу.
 *
 * Цвета — только из `BRAND_COLORS` (зеркало `globals.css`, сторож
 * `brand-colors.test.ts`): в почте нет ни Tailwind, ни CSS-переменных.
 */

const C = BRAND_COLORS;

export const EMAIL_BRAND = "МастерРядом";

/** Классы темы. Имена короткие и с префиксом: часть клиентов переписывает селекторы. */
export const EMAIL_CLASS = {
  page: "mr-page",
  card: "mr-card",
  title: "mr-title",
  text: "mr-text",
  muted: "mr-muted",
  footer: "mr-footer",
  codeBox: "mr-code-box",
  code: "mr-code",
  link: "mr-link",
} as const;

const K = EMAIL_CLASS;

/**
 * Вторичный текст тёмной версии. `--text-sec` тёмной темы (#C79BA2) в письме —
 * это ровно тот розоватый оттенок, на который жаловались; приглушённый
 * `darkTextSoft` даёт нейтральный тёплый серый (~7:1 на `darkSurfaceCard`).
 * Подвал в тёмной теме — цвета карточки, а не страницы: без тени (её в тёмной
 * почте не видно) подвал цвета страницы съедал нижний край карточки.
 */
const DARK_MUTED = withAlpha(C.darkTextSoft, 0.72);

function themeCss(): string {
  return `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
.${K.page} { background-color: ${C.surfacePage} !important; }
.${K.card} { background-color: ${C.surfaceCard} !important; }
.${K.title} { color: ${C.textMain} !important; }
.${K.text} { color: ${C.textLabel} !important; }
.${K.muted} { color: ${C.textSecondary} !important; }
.${K.footer} { background-color: ${C.surfacePage} !important; border-top-color: ${C.borderSubtle} !important; }
.${K.codeBox} { background-color: ${C.surfacePage} !important; border-color: ${C.borderSubtle} !important; }
.${K.code} { color: ${C.brandFrom} !important; }
.${K.link} { color: ${C.brandFrom} !important; }
@media (prefers-color-scheme: dark) {
  .${K.page} { background-color: ${C.darkSurfacePage} !important; }
  .${K.card} { background-color: ${C.darkSurfaceCard} !important; box-shadow: none !important; }
  .${K.title} { color: ${C.darkTextMain} !important; }
  .${K.text} { color: ${C.darkTextSoft} !important; }
  .${K.muted} { color: ${DARK_MUTED} !important; }
  .${K.footer} { background-color: ${C.darkSurfaceCard} !important; border-top-color: ${C.darkBorderSubtle} !important; }
  .${K.codeBox} { background-color: ${C.darkSurfacePage} !important; border-color: ${C.darkBorderSubtle} !important; }
  .${K.code} { color: ${C.brandAccent} !important; }
  .${K.link} { color: ${C.brandAccent} !important; }
}`;
}

/**
 * Скрытый текст превью — то, что почтовик показывает в списке писем и в пуше
 * рядом с темой. Без него туда попадало начало тела («МастерРядом Запись к
 * мастерам красоты…»). Хвост из неразрывных пробелов не даёт клиенту
 * дотянуть в превью следующий текст письма.
 */
function preheaderHtml(text: string): string {
  const filler = "&#8199;&#65279;&#847; ".repeat(40);
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:transparent;opacity:0;">${text}${filler}</div>`;
}

export function buildEmailDocument(opts: {
  /** Уже экранированный текст `<title>`. */
  title: string;
  /** Уже экранированный текст превью; без него превью не задаётся. */
  preheader?: string;
  /** Содержимое карточки под шапкой (уже экранированная разметка). */
  contentHtml: string;
  /** Содержимое подвала (уже экранированная разметка). */
  footerHtml: string;
}): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="color-scheme" content="light dark"/>
<meta name="supported-color-schemes" content="light dark"/>
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no"/>
<title>${opts.title}</title>
<style>${themeCss()}
</style>
</head>
<body class="${K.page}" style="margin:0;padding:0;background:${C.surfacePage};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${opts.preheader ? preheaderHtml(opts.preheader) : ""}
<table role="presentation" class="${K.page}" width="100%" cellpadding="0" cellspacing="0" style="background:${C.surfacePage};padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" class="${K.card}" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${C.surfaceCard};border-radius:20px;overflow:hidden;box-shadow:0 2px 12px ${withAlpha(C.textMain, 0.08)};">
      <tr>
        <td style="background:${C.brandFrom};background:${brandGradientCss()};padding:32px 32px 24px;text-align:center;">
          <p style="margin:0;font-size:20px;font-weight:700;color:${C.textOnBrand};letter-spacing:-0.3px;">${EMAIL_BRAND}</p>
          <p style="margin:6px 0 0;font-size:13px;color:${withAlpha(C.textOnBrand, 0.75)};">Запись к мастерам красоты</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 32px 28px;">
${opts.contentHtml}
        </td>
      </tr>
      <tr>
        <td class="${K.footer}" style="background:${C.surfacePage};padding:20px 32px;border-top:1px solid ${C.borderSubtle};">
${opts.footerHtml}
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
