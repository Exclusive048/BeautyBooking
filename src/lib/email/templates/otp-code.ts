import { BRAND_COLORS, brandGradientCss, withAlpha } from "@/lib/ui/brand-colors";

const BRAND = "МастерРядом";
const C = BRAND_COLORS;

/**
 * UI-04: цвета письма — из `BRAND_COLORS` (у почтового клиента нет ни Tailwind,
 * ни CSS-переменных). Шапка объявляет цвет ДВАЖДЫ намеренно: часть клиентов
 * (Outlook на движке Word) игнорирует `linear-gradient` целиком, и без сплошной
 * заливки первой строкой белый текст лёг бы на белый фон. Порядок обязателен —
 * побеждает последнее понятое клиенту объявление.
 */

export function buildOtpEmailHtml(code: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Код подтверждения</title>
</head>
<body style="margin:0;padding:0;background:${C.surfacePage};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${C.surfacePage};padding:40px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${C.surfaceCard};border-radius:20px;overflow:hidden;box-shadow:0 2px 12px ${withAlpha(C.textMain, 0.08)};">
      <tr>
        <td style="background:${C.brandFrom};background:${brandGradientCss()};padding:32px 32px 24px;text-align:center;">
          <p style="margin:0;font-size:20px;font-weight:700;color:${C.textOnBrand};letter-spacing:-0.3px;">${BRAND}</p>
          <p style="margin:6px 0 0;font-size:13px;color:${withAlpha(C.textOnBrand, 0.75)};">Запись к мастерам красоты</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 32px 28px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:${C.textMain};">Код подтверждения</p>
          <p style="margin:0 0 28px;font-size:14px;color:${C.textSecondary};line-height:1.6;">
            Введите этот код на странице входа. Код действителен 5 минут.
          </p>
          <div style="background:${C.surfacePage};border:2px solid ${C.borderSubtle};border-radius:16px;padding:24px;text-align:center;margin-bottom:28px;">
            <p style="margin:0;font-size:42px;font-weight:800;letter-spacing:12px;color:${C.brandFrom};font-family:monospace;">${code}</p>
          </div>
          <p style="margin:0;font-size:13px;color:${C.textSecondary};line-height:1.5;">
            Если вы не запрашивали этот код — просто проигнорируйте письмо. Ваш аккаунт в безопасности.
          </p>
        </td>
      </tr>
      <tr>
        <td style="background:${C.surfacePage};padding:20px 32px;border-top:1px solid ${C.borderSubtle};">
          <p style="margin:0;font-size:12px;color:${C.textSecondary};text-align:center;">
            &copy; ${year} ${BRAND} &middot; Это автоматическое письмо, не отвечайте на него
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export function buildOtpEmailText(code: string): string {
  return `Ваш код для входа: ${code}\n\nКод действителен 5 минут.\n\nЕсли вы не запрашивали этот код, проигнорируйте это письмо.`;
}
