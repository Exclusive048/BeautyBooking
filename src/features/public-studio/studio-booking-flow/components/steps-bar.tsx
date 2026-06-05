"use client";

import { Check, ChevronRight } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

export type WizardStep = "service" | "master" | "when" | "you";

type Props = {
  active: WizardStep;
  done: ReadonlySet<WizardStep>;
  scenarioB: boolean;
};

export function StepsBar({ active, done, scenarioB }: Props) {
  const steps: Array<{ id: WizardStep; label: string }> = [
    { id: "service", label: UI_TEXT.bookingWidget.steps.service },
    { id: "master", label: UI_TEXT.bookingWidget.steps.master },
    { id: "when", label: UI_TEXT.bookingWidget.steps.when },
    { id: "you", label: UI_TEXT.bookingWidget.steps.you },
  ];
  const visible = scenarioB ? steps.filter((s) => s.id !== "master") : steps;

  return (
    <div
      role="list"
      aria-label={UI_TEXT.bookingWidget.steps.ariaLabel}
      className="flex items-stretch gap-0 rounded-xl border border-border-subtle bg-bg-card p-2 sm:p-2.5"
    >
      {visible.map((step, i) => {
        const isDone = done.has(step.id);
        const isActive = active === step.id;
        const dimmed = !isActive && !isDone;
        return (
          <div
            role="listitem"
            key={step.id}
            aria-current={isActive ? "step" : undefined}
            className={`relative flex flex-1 items-center gap-2 px-2 py-1 sm:gap-3 sm:px-3 ${
              dimmed ? "opacity-60" : "opacity-100"
            }`}
          >
            <span
              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold ${
                isDone
                  ? "bg-primary text-white"
                  : isActive
                  ? "bg-text text-bg-card"
                  : "bg-bg-muted text-text-muted"
              }`}
              aria-hidden
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <div className="min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-text-muted">
                {UI_TEXT.bookingWidget.steps.stepLabel.replace("{n}", String(i + 1))}
              </div>
              <div className={`truncate text-xs ${isActive || isDone ? "font-semibold text-text" : "text-text"} sm:text-sm`}>
                {step.label}
              </div>
            </div>
            {i < visible.length - 1 ? (
              <ChevronRight
                className="absolute -right-1 top-1/2 hidden h-3.5 w-3.5 -translate-y-1/2 text-text-muted/60 sm:block"
                aria-hidden
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
