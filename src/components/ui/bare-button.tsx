import React from "react";

/**
 * Кнопка без стилей проекта (29.09 доработки · 22) — для сред, куда Tailwind не
 * доходит: `app/global-error.tsx` рендерится вместо упавшего корневого layout,
 * без `globals.css`, и стилизует себя собственным `<style>`. `Button` там
 * отрисовался бы голым браузерным контролом, поэтому класс передаётся как есть.
 * В обычной разметке — только `Button`.
 */
export function BareButton({ type = "button", ...props }: React.ComponentProps<"button">) {
  return <button type={type} {...props} />;
}
