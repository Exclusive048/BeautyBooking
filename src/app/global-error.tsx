"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Ошибка — МастерРядом</title>
        <style>{`
          *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
          body{
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            background:#fafafa;color:#0f0f0f;
            min-height:100dvh;display:flex;
            align-items:center;justify-content:center;padding:24px;
          }
          @media(prefers-color-scheme:dark){
            body{background:#111;color:#f0f0f0}
            .card{background:#1c1c1e;border-color:#2c2c2e}
            .desc{color:#8e8e93}
            .btn-sec{background:#2c2c2e;color:#f0f0f0;border-color:#3a3a3c}
            .btn-sec:hover{background:#3a3a3c}
          }
          .card{
            max-width:400px;width:100%;background:#fff;
            border:1px solid #e5e7eb;border-radius:24px;
            padding:40px 28px;text-align:center;
            box-shadow:0 4px 32px rgba(0,0,0,.07);
          }
          .icon{
            width:72px;height:72px;border-radius:50%;
            background:rgba(139,92,246,.1);
            display:flex;align-items:center;justify-content:center;
            margin:0 auto 24px;
          }
          h1{font-size:20px;font-weight:700;line-height:1.3;margin-bottom:10px}
          .desc{
            font-size:14px;color:#6b7280;line-height:1.65;
            margin-bottom:28px;max-width:300px;
            margin-left:auto;margin-right:auto;
          }
          .btns{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
          .btn{
            display:inline-flex;align-items:center;justify-content:center;
            height:44px;padding:0 22px;border-radius:14px;border:none;
            font-size:14px;font-weight:600;cursor:pointer;
            text-decoration:none;transition:opacity .15s,transform .1s;
          }
          .btn:hover{opacity:.85}
          .btn:active{transform:scale(.97)}
          .btn-pri{background:linear-gradient(135deg,#8b5cf6,#a855f7,#d946ef);color:#fff}
          .btn-sec{background:#f4f4f5;color:#111;border:1px solid #e5e7eb}
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="icon">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none"
              stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h1>Что-то пошло не так</h1>
          <p className="desc">
            Произошла непредвиденная ошибка. Попробуйте обновить страницу.
            Если проблема повторится — напишите в поддержку.
          </p>
          <div className="btns">
            <button type="button" className="btn btn-pri" onClick={reset}>
              Обновить страницу
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="btn btn-sec">На главную</a>
          </div>
        </div>
      </body>
    </html>
  );
}
