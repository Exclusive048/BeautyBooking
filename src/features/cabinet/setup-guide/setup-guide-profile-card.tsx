"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import type { SetupGuideDto, SetupGuideScope } from "@/lib/onboarding/setup-guide-shared";
import * as UI_TEXT from "@/lib/ui/text";
import { setupGuideHomeHref } from "./setup-guide-text";

const T = UI_TEXT.setupGuide;

/**
 * SETUP-GUIDE-01 — «Первые шаги» в основном профиле: по строке на кабинет
 * (мастера, студии), сколько пройдено и одно действие. Здесь же возвращают
 * карточку, скрытую с главной кабинета, — «Показать на главной» снимает
 * отметку и ведёт на главную, где карточка снова на месте.
 */
export function SetupGuideProfileCard({ guides }: { guides: SetupGuideDto[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<SetupGuideScope | null>(null);
  const [error, setError] = useState<string | null>(null);

  const show = async (scope: SetupGuideScope) => {
    setPending(scope);
    setError(null);
    try {
      await fetchJson("/api/me/setup-guide", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, action: "show" }),
      });
      router.push(setupGuideHomeHref(scope));
    } catch (caught) {
      setError(serverMessageOr(caught, T.saveError));
      setPending(null);
    }
  };

  return (
    <Card className="p-6" data-testid="setup-guide-profile">
      <div className="mb-3">
        <div className="font-display text-base text-text-main">{T.profile.title}</div>
        <div className="mt-0.5 text-xs text-text-sec">{T.profile.subtitle}</div>
      </div>
      <ul className="space-y-2.5">
        {guides.map((guide) => {
          const next = guide.steps.find((step) => step.id === guide.nextId) ?? null;
          const percent = Math.round((guide.doneCount / guide.total) * 100);
          const status = next ? T.profile.progress(guide.doneCount, guide.total) : T.profile.allDone;
          return (
            <li
              key={guide.scope}
              className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-bg-input/30 p-4 sm:flex-row sm:items-center sm:justify-between"
              data-testid="setup-guide-profile-row"
              data-scope={guide.scope}
              data-hidden={guide.hidden ? "true" : "false"}
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-medium text-text-main">
                  {guide.scope === "master" ? T.profile.cabinetMaster : T.profile.cabinetStudio}
                </p>
                <p className="text-xs text-text-sec">
                  {guide.hidden ? `${status} · ${T.profile.hiddenLabel}` : status}
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-bg-input" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
              </div>
              {guide.hidden ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0 rounded-xl"
                  onClick={() => void show(guide.scope)}
                  disabled={pending !== null}
                >
                  {T.profile.showCta}
                </Button>
              ) : next ? (
                <Button asChild variant="secondary" size="sm" className="shrink-0 rounded-xl">
                  <Link href={next.href}>{T.profile.continueCta}</Link>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-3 text-sm text-danger-text">{error}</p> : null}
    </Card>
  );
}
