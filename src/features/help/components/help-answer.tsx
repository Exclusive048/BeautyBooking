import type { HelpAnswerContent } from "@/features/help/content/help-types";
import { HelpShots } from "./help-shots";

type Props = {
  content: HelpAnswerContent;
};

/**
 * HELP-GUIDE-01 — тело ответа: абзац, шаги нумерованным списком и превью
 * снимков. Без `"use client"` и server-only зависимостей — его рендерят и
 * серверные /help и /faq, и клиентский FAQ кабинета.
 */
export function HelpAnswer({ content }: Props) {
  return (
    <div className="space-y-3">
      <p>{content.answer}</p>
      {content.steps?.length ? (
        <ol className="list-decimal space-y-1.5 pl-5 marker:text-text-sec">
          {content.steps.map((step) => (
            <li key={step} className="pl-1">
              {step}
            </li>
          ))}
        </ol>
      ) : null}
      {content.shots?.length ? <HelpShots shots={content.shots} /> : null}
    </div>
  );
}
