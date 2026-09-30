"use client";

import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { ClientListItemView } from "@/lib/master/clients-view.service";
import * as UI_TEXT from "@/lib/ui/text";
import { ClientListItem } from "./client-list-item";

const T = UI_TEXT.cabinetMaster.clients.list;
/** Сброс фильтров = тот же путь без query-параметров (`tab`, `q`, `sort`). */
const PAGE_PATH = "/cabinet/master/clients";

type Props = {
  clients: ClientListItemView[];
  selectedKey: string | null;
  onSelect: (clientKey: string) => void;
  now: Date;
  /** Empty state copy depends on whether the user is filtering. */
  isFiltering: boolean;
};

/**
 * Left pane list. Client component since 27a-FIX-URL — selection is now
 * pure React state in `<ClientsPaneClient>`, so the list propagates click
 * events via `onSelect` instead of pushing `?id=` to the URL.
 *
 * Renders the empty state when no clients match the current filters;
 * otherwise stacks `<ClientListItem>` buttons.
 */
export function ClientsList({ clients, selectedKey, onSelect, now, isFiltering }: Props) {
  if (clients.length === 0) {
    // RES-28: общий примитив вместо руками собранной разметки. Действие есть
    // только у отфильтрованного случая, и оно настоящее — фильтры живут в
    // query-строке, поэтому «сбросить» это переход на тот же путь без
    // параметров. Придумывать кнопку для случая «клиентов ещё нет» нельзя:
    // мастер не заводит клиента руками, тот появляется из брони.
    return (
      <EmptyState
        variant="card"
        icon={Users}
        title={isFiltering ? T.emptyFiltered : T.emptyTitle}
        description={isFiltering ? undefined : T.emptyBody}
        action={isFiltering ? { label: T.emptyResetCta, href: PAGE_PATH } : undefined}
      />
    );
  }

  return (
    <ul className="space-y-1">
      {clients.map((client) => (
        <li key={client.key}>
          <ClientListItem
            client={client}
            selected={client.key === selectedKey}
            onSelect={onSelect}
            now={now}
          />
        </li>
      ))}
    </ul>
  );
}
