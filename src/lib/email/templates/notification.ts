import { env } from "@/lib/env";
import { BRAND_COLORS, brandGradientCss, withAlpha } from "@/lib/ui/brand-colors";

const BRAND = "МастерРядом";
const C = BRAND_COLORS;
/**
 * Brand URL для email body links. Production resolves via `NEXT_PUBLIC_APP_URL`
 * (Zod refine enforces non-empty in production). Dev fallback — канонический
 * прод-домен `masterryadom.ru` (DOMAIN-CUTOVER-01). EMAIL-BRAND-URL-FIX-A
 * (2026-06-02) closed the pre-fix hardcode to the dead `beautyhub.art` domain.
 */
const BRAND_URL = env.NEXT_PUBLIC_APP_URL ?? "https://masterryadom.ru";

export function buildNotificationEmailHtml(opts: {
  title: string;
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
  unsubscribeUrl?: string;
}): string {
  const year = new Date().getFullYear();
  const ctaBlock = opts.ctaUrl
    ? `<div style="text-align:center;margin:24px 0;">
        <a href="${opts.ctaUrl}"
           style="display:inline-block;padding:12px 28px;background:${C.brandFrom};background:${brandGradientCss()};color:${C.textOnBrand};border-radius:12px;font-size:15px;font-weight:600;text-decoration:none;">
          ${opts.ctaLabel ?? "Посмотреть"}
        </a>
       </div>`
    : "";

  const unsubBlock = opts.unsubscribeUrl
    ? `<a href="${opts.unsubscribeUrl}" style="color:${C.textSecondary};text-decoration:underline;">Отписаться от писем</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:${C.surfacePage};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${C.surfacePage};padding:40px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${C.surfaceCard};border-radius:20px;overflow:hidden;box-shadow:0 2px 12px ${withAlpha(C.textMain, 0.08)};">
      <tr>
        <td style="background:${C.brandFrom};background:${brandGradientCss()};padding:28px 32px 22px;text-align:center;">
          <p style="margin:0;font-size:20px;font-weight:700;color:${C.textOnBrand};letter-spacing:-0.3px;">${BRAND}</p>
          <p style="margin:5px 0 0;font-size:12px;color:${withAlpha(C.textOnBrand, 0.75)};">Запись к мастерам красоты</p>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px 24px;">
          <p style="margin:0 0 12px;font-size:20px;font-weight:700;color:${C.textMain};">${opts.title}</p>
          <p style="margin:0;font-size:15px;color:${C.textLabel};line-height:1.65;">${opts.body.replace(/\n/g, "<br/>")}</p>
          ${ctaBlock}
        </td>
      </tr>
      <tr>
        <td style="background:${C.surfacePage};padding:18px 32px;border-top:1px solid ${C.borderSubtle};">
          <p style="margin:0;font-size:12px;color:${C.textSecondary};text-align:center;line-height:1.6;">
            Вы получили это письмо, потому что подключили уведомления на <a href="${BRAND_URL}" style="color:${C.brandFrom};">${BRAND}</a>.<br/>
            ${unsubBlock}
            <br/>&copy; ${year} ${BRAND}
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
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
