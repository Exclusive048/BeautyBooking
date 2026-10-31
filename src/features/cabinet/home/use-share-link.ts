"use client";

import { useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetHome.quickActions;

/**
 * «Поделиться страницей» на главной кабинета: системная шторка, где она есть,
 * иначе — копирование ссылки с тостом об итоге (UX-PASS-01: молча было не
 * видно ни успеха, ни отказа). Закрытая шторка — не отказ, копировать не нужно.
 */
export function useShareLink(url: string | null): (() => Promise<void>) | null {
  const toast = useToast();

  const share = useCallback(async () => {
    if (!url) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Иначе (шторка недоступна в этом контексте) — к буферу обмена.
      }
    }
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error(T.shareCopyFailed);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(T.shareCopied);
    } catch {
      toast.error(T.shareCopyFailed);
    }
  }, [toast, url]);

  return url ? share : null;
}
