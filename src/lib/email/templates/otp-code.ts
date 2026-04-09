const BRAND = "МастерРядом";

export function buildOtpEmailHtml(code: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Код подтверждения</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <tr>
        <td style="background:linear-gradient(135deg,#7c3aed,#ec4899);padding:32px 32px 24px;text-align:center;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${BRAND}</p>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.75);">Запись к мастерам красоты</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 32px 28px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Код подтверждения</p>
          <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6;">
            Введите этот код на странице входа. Код действителен 5 минут.
          </p>
          <div style="background:#f5f3ff;border:2px solid #ede9fe;border-radius:16px;padding:24px;text-align:center;margin-bottom:28px;">
            <p style="margin:0;font-size:42px;font-weight:800;letter-spacing:12px;color:#7c3aed;font-family:monospace;">${code}</p>
          </div>
          <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
            Если вы не запрашивали этот код — просто проигнорируйте письмо. Ваш аккаунт в безопасности.
          </p>
        </td>
      </tr>
      <tr>
        <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
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
