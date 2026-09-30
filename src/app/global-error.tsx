"use client";

import { useErrorBoundaryReport } from "@/hooks/use-error-boundary-report";
import { BRAND_COLORS, brandGradientCss, withAlpha } from "@/lib/ui/brand-colors";
import { BareButton } from "@/components/ui/bare-button";

// UI-04: экран рендерится при падении root-layout, то есть Tailwind здесь
// недоступен по определению — но значения обязаны быть бренд-бордовыми, а не
// произвольными. Источник — `BRAND_COLORS` (зеркало `globals.css`).
const C = BRAND_COLORS;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // RES-17: та же обработка, что у остальных boundary — оба канала (трекер +
  // структурный лог) живут в одном хуке. Здесь она была первой и до RES-17
  // единственной.
  useErrorBoundaryReport(error);

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
            background:${C.surfacePage};color:${C.textMain};
            min-height:100dvh;display:flex;
            align-items:center;justify-content:center;padding:24px;
          }
          .card{
            max-width:400px;width:100%;background:${C.surfaceCard};
            border:1px solid ${C.borderSubtle};border-radius:24px;
            padding:40px 28px;text-align:center;
            box-shadow:0 4px 32px ${withAlpha(C.textMain, 0.1)};
          }
          .icon{
            width:72px;height:72px;border-radius:50%;
            background:${withAlpha(C.brandVia, 0.1)};
            display:flex;align-items:center;justify-content:center;
            margin:0 auto 24px;
          }
          .icon svg{color:${C.brandVia}}
          h1{font-size:20px;font-weight:700;line-height:1.3;margin-bottom:10px}
          .desc{
            font-size:14px;color:${C.textSecondary};line-height:1.65;
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
          .btn-pri{background:${brandGradientCss()};color:${C.textOnBrand}}
          .btn-sec{background:${C.surfacePage};color:${C.textMain};border:1px solid ${C.borderSubtle}}
          /* Тёмная схема идёт ПОСЛЕ базовых правил: специфичность у них
             одинаковая, поэтому решает порядок. Раньше блок стоял выше — и
             переопределялся целиком, то есть тёмной ветки фактически не
             существовало: на тёмном фоне рисовалась светлая карточка со
             светлым же заголовком. Нашлось смоуком UI-04. */
          @media(prefers-color-scheme:dark){
            body{background:${C.darkSurfacePage};color:${C.darkTextMain}}
            .card{background:${C.darkSurfaceCard};border-color:${C.darkBorderSubtle}}
            .desc{color:${C.darkTextSecondary}}
            .icon{background:${withAlpha(C.brandVia, 0.28)}}
            .icon svg{color:${C.darkTextMain}}
            .btn-sec{background:${withAlpha(C.darkTextMain, 0.08)};color:${C.darkTextMain};border-color:${C.darkBorderSubtle}}
            .btn-sec:hover{background:${withAlpha(C.darkTextMain, 0.14)}}
          }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="icon">
            {/* Обводка — через `currentColor`: цвет иконки задаётся классом
                `.icon svg`, поэтому тёмная схема может его переопределить
                (бордо на угольном фоне нечитаемо). */}
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <BareButton className="btn btn-pri" onClick={reset}>
              Обновить страницу
            </BareButton>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="btn btn-sec">На главную</a>
          </div>
        </div>
      </body>
    </html>
  );
}
