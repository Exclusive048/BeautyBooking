"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { journalHref, type JournalParamPatch } from "../lib/journal-params";

/**
 * BOOKINGS-JOURNAL — переход журнала: правка параметров адреса, сервер
 * страницы собирает записи заново. Переход идёт в `useTransition`, поэтому
 * прежний список остаётся на экране, пока не пришёл новый, а вызывающий
 * показывает ожидание (`pending`).
 *
 * Выбор даты кладётся в историю (`push`) — «Назад» возвращает к прежнему дню;
 * ввод поиска — `replace`, иначе каждая буква была бы шагом истории.
 */
export function useJournalNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = useCallback(
    (patch: JournalParamPatch, options: { history: "push" | "replace" } = { history: "push" }) => {
      const href = journalHref(pathname, new URLSearchParams(searchParams.toString()), patch);
      startTransition(() => {
        if (options.history === "replace") router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  return { update, pending };
}
