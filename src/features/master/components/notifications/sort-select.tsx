"use client";

import * as UI_TEXT from "@/lib/ui/text";

import { UrlSortSelect } from "../url-sort-select";
import type { NotificationSort } from "./lib/group-by-day";

const T = UI_TEXT.cabinetMaster.notifications.sort;

const OPTIONS: ReadonlyArray<{ value: NotificationSort; label: string }> = [
  { value: "newest", label: T.newest },
  { value: "oldest", label: T.oldest },
];

/** Сортировка уведомлений — общий `UrlSortSelect` (29.09 доработки · 22). */
export function SortSelect({ value }: { value: NotificationSort }) {
  return <UrlSortSelect value={value} defaultValue="newest" options={OPTIONS} label={T.label} />;
}
