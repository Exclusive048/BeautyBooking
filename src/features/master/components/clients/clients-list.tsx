"use client";

import { Users } from "lucide-react";
import type { ClientListItemView } from "@/lib/master/clients-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { ClientListItem } from "./client-list-item";

const T = UI_TEXT.cabinetMaster.clients.list;

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
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-subtle bg-bg-card px-4 py-12 text-center">
        <Users className="mb-3 h-10 w-10 text-text-sec/40" aria-hidden />
        <p className="font-display text-base text-text-main">
          {isFiltering ? T.emptyFiltered : T.emptyTitle}
        </p>
        {!isFiltering ? (
          <p className="mt-1 max-w-xs text-sm text-text-sec">{T.emptyBody}</p>
        ) : null}
      </div>
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
