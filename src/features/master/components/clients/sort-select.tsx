"use client";

import type { ClientsSortId } from "@/lib/master/clients-view.service";
import * as UI_TEXT from "@/lib/ui/text";

import { UrlSortSelect } from "../url-sort-select";

const T = UI_TEXT.cabinetMaster.clients.sort;

const OPTIONS: ReadonlyArray<{ value: ClientsSortId; label: string }> = [
  { value: "recent", label: T.recent },
  { value: "alphabetical", label: T.alphabetical },
  { value: "ltv_desc", label: T.ltvDesc },
];

/** Сортировка клиентов — общий `UrlSortSelect` (29.09 доработки · 22). */
export function ClientsSortSelect({ value }: { value: ClientsSortId }) {
  return <UrlSortSelect value={value} defaultValue="recent" options={OPTIONS} label={T.label} />;
}
