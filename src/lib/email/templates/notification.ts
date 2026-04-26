const BRAND = "МастерРядом";
const BRAND_URL = "https://beautyhub.art";

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
           style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#ffffff;border-radius:12px;font-size:15px;font-weight:600;text-decoration:none;">
          ${opts.ctaLabel ?? "Посмотреть"}
        </a>
       </div>`
    : "";

  const unsubBlock = opts.unsubscribeUrl
    ? `<a href="${opts.unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Отключить email-уведомления</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <tr>
        <td style="background:linear-gradient(135deg,#7c3aed,#ec4899);padding:28px 32px 22px;text-align:center;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${BRAND}</p>
          <p style="margin:5px 0 0;font-size:12px;color:rgba(255,255,255,0.75);">Запись к мастерам красоты</p>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px 24px;">
          <p style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111827;">${opts.title}</p>
          <p style="margin:0;font-size:15px;color:#374151;line-height:1.65;">${opts.body.replace(/\n/g, "<br/>")}</p>
          ${ctaBlock}
        </td>
      </tr>
      <tr>
        <td style="background:#f9fafb;padding:18px 32px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
            Вы получили это письмо, потому что подключили уведомления на <a href="${BRAND_URL}" style="color:#7c3aed;">${BRAND}</a>.<br/>
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
