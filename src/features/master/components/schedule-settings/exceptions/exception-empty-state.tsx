"use client";

import { CalendarX, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.scheduleSettings.exceptions;

type Props = {
  onAdd: () => void;
};

/**
 * Empty state for the Exceptions tab. Shown when there are no overrides
 * for the provider yet. Mirrors the placeholder-tab vocabulary so the
 * "nothing here" + CTA grammar is consistent across the cabinet.
 */
export function ExceptionEmptyState({ onAdd }: Props) {
  return (
    <EmptyState
      icon={CalendarX}
      title={T.emptyTitle}
      description={T.emptyBody}
      action={{ label: T.emptyCta, onClick: onAdd, leadingIcon: Plus }}
    />
  );
}
