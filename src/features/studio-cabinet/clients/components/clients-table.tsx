import { Users } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioClientRow } from "../lib/types";
import { ClientTableRow } from "./client-row";

const T = UI_TEXT.studioCabinet.clientsV2;

type Props = {
  rows: StudioClientRow[];
};

export function ClientsTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-subtle bg-bg-card p-10 text-center">
        <Users className="h-10 w-10 text-text-sec/30" aria-hidden />
        <p className="text-base font-semibold text-text-main">{T.empty.title}</p>
        <p className="max-w-md text-sm text-text-sec">{T.empty.hint}</p>
      </div>
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
            <ClientTableRow key={row.key} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
