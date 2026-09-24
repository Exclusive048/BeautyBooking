"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.guestManage;

type Props = {
  /** Относительный путь страницы управления из ответа на создание записи. */
  manageUrl: string;
};

/**
 * GUEST-MANAGE-LINK — карточка на экране успеха гостевой записи: ссылка
 * «Управлять записью» (отмена/перенос без аккаунта) и её копирование.
 * Показывается во всех четырёх гостевых флоу (запись к мастеру, в студию,
 * пакет мастера, пакет студии). Ссылка выдаётся один раз — в ответе на
 * создание, поэтому её и просят сохранить.
 */
export function GuestManageLinkCard({ manageUrl }: Props) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(new URL(manageUrl, window.location.origin).toString());
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border-subtle bg-bg-page p-3 text-left" data-testid="guest-manage-link">
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-text-sec" aria-hidden strokeWidth={1.6} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-main">{T.linkTitle}</p>
          <p className="mt-0.5 text-xs text-text-sec">{T.linkHint}</p>
        </div>
      </div>
      {/* Всегда столбиком: карточка живёт и в узкой панели записи, и в модалке пакета. */}
      <div className="flex flex-col gap-2">
        <Button asChild variant="secondary" size="sm" className="w-full">
          <Link href={manageUrl}>{T.open}</Link>
        </Button>
        <Button variant="ghost" size="sm" className="w-full gap-1.5" onClick={() => void handleCopy()}>
          {copyState === "copied" ? (
            <Check className="h-4 w-4" aria-hidden strokeWidth={1.8} />
          ) : (
            <Copy className="h-4 w-4" aria-hidden strokeWidth={1.8} />
          )}
          {copyState === "copied" ? T.copied : T.copy}
        </Button>
      </div>
      {copyState === "failed" ? (
        <p className="text-xs text-text-sec" role="status">
          {T.copyFailed}
        </p>
      ) : null}
    </div>
  );
}
