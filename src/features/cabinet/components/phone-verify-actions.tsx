"use client";

import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import { VkIcon } from "@/components/ui/vk-icon";

export type PhoneVerifyProviders = { vk: boolean; yandex: boolean };

type Props = {
  providers: PhoneVerifyProviders;
  className?: string;
};

const T = UI_TEXT.phoneVerify;

/**
 * PHONE-OAUTH-PROOF-01 — «Подтвердить номер через ВКонтакте / Яндекс ID».
 *
 * Обычная навигация на стартовую ногу OAuth с `?verifyPhone=1`: провайдер
 * отдаёт номер, привязанный к аккаунту (он подтверждён у него по SMS), колбэк
 * засчитывает его как владение и возвращает на эту же страницу с итогом —
 * его показывает `PhoneVerifyNotice`. Какие провайдеры включены, решает сервер
 * (`resolveAuthMethods` / env) и передаёт пропом.
 */
export function PhoneVerifyActions({ providers, className }: Props) {
  if (!providers.vk && !providers.yandex) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="flex items-start gap-1.5 text-xs text-text-sec">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {T.hint}
      </p>
      <div className="flex flex-wrap gap-2">
        {providers.vk ? (
          <Button asChild variant="secondary" size="sm">
            <a href="/api/auth/vk/start?verifyPhone=1">
              <VkIcon className="h-4 w-4" />
              {T.viaVk}
            </a>
          </Button>
        ) : null}
        {providers.yandex ? (
          <Button asChild variant="secondary" size="sm">
            <a href="/api/auth/yandex/start?verifyPhone=1">{T.viaYandex}</a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
