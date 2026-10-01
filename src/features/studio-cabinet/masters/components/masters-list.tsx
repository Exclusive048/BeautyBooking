import { Plus, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioMasterListItem } from "../server/types";
import { MasterListItem } from "./master-list-item";
import { Button } from "@/components/ui/button";

const T = UI_TEXT.studioCabinet.mastersV2;

export function MastersList({
  items,
  selectedId,
  totalCount,
  onInviteClick,
}: {
  items: StudioMasterListItem[];
  selectedId: string | null;
  totalCount: number;
  /** Server component cannot pass functions across boundaries; the
   * invite-card is a presentational link to the page-level `?invite=1`
   * trigger handled by `MastersHeader`. We instead surface a button
   * that the parent client wraps; for simplicity, this footer renders
   * a Link/button passed in. */
  onInviteClick?: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="eyebrow">
        {T.list.shownTemplate
          .replace("{count}", String(items.length))
          .replace("{total}", String(totalCount))}
      </p>

      {items.length === 0 ? (
        // RES-28: общий примитив. Отдельной кнопки нет намеренно — приглашение
        // мастера уже стоит карточкой прямо под списком (`inviteCard` ниже) и
        // рендерится в том числе при пустом списке; вторая копия того же
        // действия дала бы два CTA подряд.
        <EmptyState
          variant="card"
          icon={Users}
          title={totalCount === 0 ? T.list.emptyTeam : T.list.empty}
          className="px-6 py-8"
        />
      ) : (
        <ul className="space-y-2">
          {items.map((master) => (
            <li key={master.id}>
              <MasterListItem
                master={master}
                isSelected={
                  selectedId !== null &&
                  (master.id === selectedId || master.urlHandle === selectedId)
                }
              />
            </li>
          ))}
        </ul>
      )}

      {onInviteClick ? (
        <Button variant="wrapper"
          onClick={onInviteClick}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border-subtle bg-bg-card/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-bg-input/30"
        >
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-accent-text"
          >
            <Plus className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-main">
              {T.inviteCard.title}
            </p>
            <p className="mt-0.5 truncate text-xs text-text-sec">
              {T.inviteCard.subtitle}
            </p>
          </div>
        </Button>
      ) : null}
    </div>
  );
}
