import { BRAND_COLORS } from "@/lib/ui/brand-colors";
import { EMAIL_BRAND, EMAIL_CLASS as K, buildEmailDocument } from "@/lib/email/templates/layout";

const C = BRAND_COLORS;

/**
 * UI-04: цвета письма — из `BRAND_COLORS` (у почтового клиента нет ни Tailwind,
 * ни CSS-переменных). Каркас, шапка и тёмная тема — `layout.ts` (EMAIL-DARK-01):
 * каждый цветной элемент несёт инлайновый светлый цвет И класс темы, который
 * в тёмной теме меняет его на тёмную версию.
 *
 * Код приходит от сервера (только цифры), пользовательского ввода в письме нет.
 */

export function buildOtpEmailHtml(code: string): string {
  const year = new Date().getFullYear();
  const content = `          <p class="${K.title}" style="margin:0 0 8px;font-size:22px;font-weight:700;color:${C.textMain};">Код подтверждения</p>
          <p class="${K.muted}" style="margin:0 0 28px;font-size:14px;color:${C.textSecondary};line-height:1.6;">
            Введите этот код на странице входа. Код действителен 5 минут.
          </p>
          <div class="${K.codeBox}" style="background:${C.surfacePage};border:2px solid ${C.borderSubtle};border-radius:16px;padding:24px;text-align:center;margin-bottom:28px;">
            <p class="${K.code}" style="margin:0;font-size:42px;font-weight:800;letter-spacing:12px;color:${C.brandFrom};font-family:monospace;">${code}</p>
          </div>
          <p class="${K.muted}" style="margin:0;font-size:13px;color:${C.textSecondary};line-height:1.5;">
            Если вы не запрашивали этот код — просто проигнорируйте письмо. Ваш аккаунт в безопасности.
          </p>`;
  const footer = `          <p class="${K.muted}" style="margin:0;font-size:12px;color:${C.textSecondary};text-align:center;">
            &copy; ${year} ${EMAIL_BRAND} &middot; Это автоматическое письмо, не отвечайте на него
          </p>`;
  return buildEmailDocument({
    title: "Код подтверждения",
    // Код в превью: его видно в списке писем и в пуше, не открывая письмо.
    preheader: `Код для входа: ${code} · действует 5 минут`,
    contentHtml: content,
    footerHtml: footer,
  });
}

export function buildOtpEmailText(code: string): string {
  return `Ваш код для входа: ${code}\n\nКод действителен 5 минут.\n\nЕсли вы не запрашивали этот код, проигнорируйте это письмо.`;
}
