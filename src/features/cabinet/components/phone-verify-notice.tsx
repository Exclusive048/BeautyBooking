"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.phoneVerify;

type Outcome = keyof typeof T.result;

const OUTCOMES = new Set<string>(Object.keys(T.result));

const TONE: Record<Outcome, "success" | "warning" | "danger"> = {
  verified: "success",
  already: "success",
  mismatch: "warning",
  no_phone: "warning",
  taken: "danger",
  error: "danger",
};

const TONE_CLASS = {
  success: "border-success-border bg-success-surface text-success-text",
  warning: "border-warning-border bg-warning-surface text-warning-text",
  danger: "border-danger-border bg-danger-surface text-danger-text",
} as const;

/**
 * PHONE-OAUTH-PROOF-01 — итог «Подтвердить номер через ВКонтакте / Яндекс ID».
 *
 * Колбэк OAuth возвращает на страницу-источник с `?phoneVerify=<исход>&via=<vk|yandex>`
 * (`phone-verify-return.ts`); здесь это становится понятной фразой. «Скрыть»
 * снимает параметры из адреса — `history.replaceState(null, …)`: с чужим
 * состоянием роутер Next считал бы вызов своим и не обновлял `useSearchParams`.
 */
export function PhoneVerifyNotice({ className }: { className?: string }) {
  const params = useSearchParams();
  const [dismissed, setDismissed] = useState(false);
  const raw = params.get("phoneVerify");
  if (dismissed || !raw || !OUTCOMES.has(raw)) return null;

  const outcome = raw as Outcome;
  const provider = params.get("via") === "yandex" ? T.providerYandex : T.providerVk;
  const text = T.result[outcome].replace("{provider}", provider);

  const dismiss = () => {
    setDismissed(true);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("phoneVerify");
      url.searchParams.delete("via");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Адрес не поправили — сообщение всё равно скрыто.
    }
  };

  return (
    <div
      role="status"
      className={cn(
        "flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm",
        TONE_CLASS[TONE[outcome]],
        className,
      )}
    >
      <p>{text}</p>
      <Button
        variant="wrapper"
        size="none"
        onClick={dismiss}
        aria-label={T.dismiss}
        className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      >
        <X className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
