"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * Итог удаления аккаунта: `delete-account-section` уводит на `/?deleted=1`.
 *
 * Живёт на главной для ОБЕИХ веток (29.09 доработки · 10). Раньше сообщение
 * стояло в `HomeFeed`, а лента рендерится только вошедшему — после удаления
 * человек уже гость и видит лендинг, то есть сообщение не показывалось никогда.
 * Показать один раз (ref переживает двойной вызов эффекта в StrictMode) и снять
 * флаг из адреса, чтобы обновление страницы его не повторило.
 */
export function AccountDeletedNotice() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current || searchParams.get("deleted") !== "1") return;
    shown.current = true;
    toast.success(UI_TEXT.home.accountDeleted);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("deleted");
    const suffix = next.toString();
    router.replace(suffix ? `/?${suffix}` : "/");
  }, [router, searchParams, toast]);

  return null;
}
