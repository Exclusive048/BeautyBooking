import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  StudioCabinetServiceOption,
  StudioCabinetShellExtras,
} from "@/features/studio-cabinet/schedule/server/shell-extras.service";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioClientRow } from "../lib/types";
import { ClientTableRow } from "./client-row";

const T = UI_TEXT.studioCabinet.clientsV2;
/** Сброс фильтров = тот же путь без query-параметров. */
const PAGE_PATH = "/cabinet/studio/clients";

type Props = {
  rows: StudioClientRow[];
  /** STUDIO-CLIENT-WRITE-DIALOG-A: passed through to each row's
   *  «Записать» button island so the dialog can render in-context. */
  studioId: string;
  scheduleMasters: StudioCabinetShellExtras["scheduleMasters"];
  services: StudioCabinetServiceOption[];
  /** TZ-DISPLAY-SALON-PARITY-01: salon tz for the «Записать» dialog. */
  timezone: string;
  /** RES-28: применён ли хоть один фильтр — от этого зависит, есть ли у пустого
   * состояния действие. Считает страница: только она знает значения по умолчанию. */
  isFiltered: boolean;
};

export function ClientsTable({
  rows,
  studioId,
  scheduleMasters,
  services,
  timezone,
  isFiltered,
}: Props) {
  if (rows.length === 0) {
    // RES-28: общий примитив. Действие — сброс фильтров и только при их
    // наличии; для случая «клиентов ещё нет» кнопки нет намеренно — «+ Клиент»
    // уже стоит в шапке страницы, и вторая копия дала бы два CTA на экране.
    // Текст тоже зависит от фильтра: живой прогон показал, что под запросом,
    // который ничего не нашёл, страница уверяла «Клиенты появятся после первых
    // записей» — при 16 клиентах в базе и счётчике «0 отфильтровано» в шапке.
    return (
      <EmptyState
        variant="card"
        icon={Users}
        title={isFiltered ? T.empty.filteredTitle : T.empty.title}
        description={isFiltered ? T.empty.filteredHint : T.empty.hint}
        action={isFiltered ? { label: T.empty.resetCta, href: PAGE_PATH } : undefined}
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-bg-card">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-bg-input/40 text-[10px] font-mono uppercase tracking-[0.12em] text-text-sec">
            <th className="px-3 py-2.5">{T.table.colClient}</th>
            <th className="px-3 py-2.5">{T.table.colPhone}</th>
            <th className="px-3 py-2.5">{T.table.colVisits}</th>
            <th className="px-3 py-2.5">{T.table.colLtv}</th>
            <th className="px-3 py-2.5">{T.table.colLast}</th>
            <th className="px-3 py-2.5">{T.table.colMainMaster}</th>
            <th className="px-2 py-2.5" aria-hidden></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ClientTableRow
              key={row.key}
              row={row}
              studioId={studioId}
              scheduleMasters={scheduleMasters}
              services={services}
              timezone={timezone}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
