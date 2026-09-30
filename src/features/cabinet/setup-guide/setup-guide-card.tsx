"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import type { SetupGuideDto } from "@/lib/onboarding/setup-guide-shared";
import * as UI_TEXT from "@/lib/ui/text";
import { cn } from "@/lib/cn";
import { setupStepText } from "./setup-guide-text";

const T = UI_TEXT.setupGuide;

/**
 * SETUP-GUIDE-01 — «Первые шаги» на главной кабинета: сколько пройдено,
 * следующий шаг крупно, ниже — все шаги. Нажатие ведёт на экран шага, где
 * подсказка (`SetupGuideHint`) показывает, что нажать, и переводит дальше.
 * Шаги отмечаются сами по данным кабинета; «Скрыть» убирает карточку.
 * Когда всё пройдено, карточка сворачивается до итога и «Скрыть». Скрытая
 * карточка на месте говорит, где её вернуть, — в основном профиле
 * (`SetupGuideProfileCard`).
 */
export function SetupGuideCard({ guide }: { guide: SetupGuideDto }) {
  const [hiding, startHiding] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hiddenNow, setHiddenNow] = useState(false);
  const next = guide.steps.find((step) => step.id === guide.nextId) ?? null;
  const percent = Math.round((guide.doneCount / guide.total) * 100);

  const hide = () => {
    setError(null);
    startHiding(async () => {
      try {
        await fetchJson("/api/me/setup-guide", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: guide.scope, action: "hide" }),
        });
        setHiddenNow(true);
      } catch (caught) {
        setError(serverMessageOr(caught, T.saveError));
      }
    });
  };

  if (hiddenNow) {
    return (
      <section
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3 shadow-card sm:px-5"
        data-testid="setup-guide-hidden"
      >
        <p className="min-w-0 text-sm text-text-sec">{T.hiddenNotice}</p>
        <Button asChild variant="ghost" size="sm" className="rounded-xl">
          <Link href="/cabinet/profile">{T.toProfile}</Link>
        </Button>
      </section>
    );
  }

  return (
    <section
      className="space-y-4 rounded-2xl border border-border-subtle bg-bg-card p-4 shadow-card sm:p-5"
      data-testid="setup-guide-card"
      aria-labelledby="setup-guide-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2
            id="setup-guide-title"
            className="font-display text-lg text-text-main"
          >
            {next ? T.title : T.doneTitle}
          </h2>
          <p className="text-sm text-text-sec">
            {next
              ? guide.scope === "master"
                ? T.subtitleMaster
                : T.subtitleStudio
              : guide.scope === "master"
                ? T.doneBodyMaster
                : T.doneBodyStudio}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-xl"
          onClick={hide}
          disabled={hiding}
        >
          {T.hideCta}
        </Button>
      </div>

      {next ? (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-text-sec">
              <span>{T.progressLabel}</span>
              <span>{T.progress(guide.doneCount, guide.total)}</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-bg-input"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={guide.total}
              aria-valuenow={guide.doneCount}
              aria-label={T.progressAria(guide.doneCount, guide.total)}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-medium uppercase tracking-wide text-accent-text">
                {T.nextLabel}
              </p>
              <p className="font-medium text-text-main">
                {setupStepText(guide.scope, next.id).title}
              </p>
              <p className="text-sm text-text-sec">
                {setupStepText(guide.scope, next.id).body}
              </p>
              {next.id === "masters" && guide.invitesPending > 0 ? (
                <p className="text-xs text-text-sec">
                  {T.invitesPending(guide.invitesPending)}
                </p>
              ) : null}
            </div>
            <Button
              asChild
              variant="primary"
              size="md"
              className="shrink-0 rounded-xl"
            >
              <Link href={next.href} data-testid="setup-guide-continue">
                {T.continueCta}
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>

          <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {guide.steps.map((step, index) => {
              const text = setupStepText(guide.scope, step.id);
              return (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-bg-input",
                      step.id === guide.nextId && "bg-bg-input",
                    )}
                    data-testid="setup-guide-step"
                    data-step={step.id}
                    data-done={step.done ? "true" : "false"}
                    data-blocked={step.blocked ? "true" : undefined}
                  >
                    {step.done ? (
                      <CheckCircle2
                        className="h-5 w-5 shrink-0 text-success-text"
                        aria-label={T.doneAria}
                      />
                    ) : (
                      <Circle
                        className="h-5 w-5 shrink-0 text-text-sec"
                        aria-hidden
                      />
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span
                        className={cn(
                          "truncate",
                          step.done || step.blocked
                            ? "text-text-sec"
                            : "font-medium text-text-main",
                        )}
                      >
                        {index + 1}. {text.title}
                      </span>
                      {step.blocked ? (
                        <span className="text-xs text-text-sec">
                          {T.blockedNote}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
      {error ? <p className="text-sm text-danger-text">{error}</p> : null}
    </section>
  );
}
