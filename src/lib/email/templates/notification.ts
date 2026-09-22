import { env } from "@/lib/env";
import { BRAND_COLORS, brandGradientCss } from "@/lib/ui/brand-colors";
import { EMAIL_BRAND as BRAND, EMAIL_CLASS as K, buildEmailDocument } from "@/lib/email/templates/layout";

const C = BRAND_COLORS;
/**
 * Brand URL для email body links. Production resolves via `NEXT_PUBLIC_APP_URL`
 * (Zod refine enforces non-empty in production). Dev fallback — канонический
 * прод-домен `masterryadom.ru` (DOMAIN-CUTOVER-01). EMAIL-BRAND-URL-FIX-A
 * (2026-06-02) closed the pre-fix hardcode to the dead `beautyhub.art` domain.
 */
const BRAND_URL = env.NEXT_PUBLIC_APP_URL ?? "https://masterryadom.ru";

/**
 * Заголовок и текст уведомления собираются из пользовательского ввода — имя
 * гостя в брони, название услуги, имя мастера. Без экранирования гость,
 * назвавшийся `<a href="https://…">…</a>`, вставлял бы свою ссылку в письмо,
 * которое мастер получает от домена платформы: фишинг нашими же DKIM/SPF,
 * а чужие ссылки в теле ещё и тянут письмо в спам. Атрибутный контекст
 * (`href`) требует и кавычек, поэтому экранируются все пять символов.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Заголовки письма-уведомления. `List-Unsubscribe` почтовики (Яндекс, Mail.ru,
 * Gmail) учитывают при фильтрации и показывают по нему свою кнопку «Отписаться»
 * — без него единственный выход для получателя это «Это спам», который и
 * портит репутацию домена. Только абсолютный http(s)-адрес: относительный путь
 * в заголовке почтовик разрешить не может.
 *
 * ⚠️ Адрес ведёт на настройки кабинета (нужен вход), то есть это НЕ отписка
 * в один клик по RFC 8058 — `List-Unsubscribe-Post` поэтому не ставится.
 */
export function buildNotificationEmailHeaders(opts: { unsubscribeUrl?: string }): Record<string, string> {
  const url = opts.unsubscribeUrl;
  if (!url || !/^https?:\/\//i.test(url)) return {};
  return { "List-Unsubscribe": `<${url}>` };
}

export function buildNotificationEmailHtml(opts: {
  title: string;
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
  unsubscribeUrl?: string;
}): string {
  const year = new Date().getFullYear();
  const title = escapeHtml(opts.title);
  const body = escapeHtml(opts.body).replace(/\n/g, "<br/>");
  const ctaBlock = opts.ctaUrl
    ? `<div style="text-align:center;margin:24px 0;">
        <a href="${escapeHtml(opts.ctaUrl)}"
           style="display:inline-block;padding:12px 28px;background:${C.brandFrom};background:${brandGradientCss()};color:${C.textOnBrand};border-radius:12px;font-size:15px;font-weight:600;text-decoration:none;">
          ${escapeHtml(opts.ctaLabel ?? "Посмотреть")}
        </a>
       </div>`
    : "";

  const unsubBlock = opts.unsubscribeUrl
    ? `<a class="${K.muted}" href="${escapeHtml(opts.unsubscribeUrl)}" style="color:${C.textSecondary};text-decoration:underline;">Отписаться от писем</a>`
    : "";

  // Каркас, шапка и тёмная тема — `layout.ts` (EMAIL-DARK-01). CTA-кнопка стоит
  // на бренд-градиенте в обеих темах: тёмный фон + белый текст инверторы не трогают.
  const content = `          <p class="${K.title}" style="margin:0 0 12px;font-size:20px;font-weight:700;color:${C.textMain};">${title}</p>
          <p class="${K.text}" style="margin:0;font-size:15px;color:${C.textLabel};line-height:1.65;">${body}</p>
          ${ctaBlock}`;
  const footer = `          <p class="${K.muted}" style="margin:0;font-size:12px;color:${C.textSecondary};text-align:center;line-height:1.6;">
            Вы получили это письмо, потому что подключили уведомления на <a class="${K.link}" href="${BRAND_URL}" style="color:${C.brandFrom};">${BRAND}</a>.<br/>
            ${unsubBlock}
            <br/>&copy; ${year} ${BRAND}
          </p>`;

  return buildEmailDocument({
    title,
    preheader: previewText(body),
    contentHtml: content,
    footerHtml: footer,
  });
}

/**
 * Превью письма в списке — первая строка текста уведомления, а не «МастерРядом
 * Запись к мастерам красоты» из шапки. Берётся из УЖЕ экранированного тела:
 * обрезка по `<br/>` не разрывает сущность, а длина ограничена с запасом.
 */
function previewText(escapedBody: string): string {
  const firstLine = escapedBody.split("<br/>")[0]?.trim() ?? "";
  return firstLine.length > 140 ? `${firstLine.slice(0, 140).replace(/&[^;]*$/, "")}…` : firstLine;
}

export function buildNotificationEmailText(opts: {
  title: string;
  body: string;
  ctaUrl?: string;
}): string {
  const lines = [opts.title, "", opts.body];
  if (opts.ctaUrl) lines.push("", opts.ctaUrl);
  lines.push("", `— ${BRAND}`);
  return lines.join("\n");
}
