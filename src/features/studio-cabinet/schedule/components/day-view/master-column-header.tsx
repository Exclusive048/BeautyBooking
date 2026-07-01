import { ResilientImage } from "@/components/ui/resilient-image";
import { UI_TEXT } from "@/lib/ui/text";
import type { ScheduleMasterColumn } from "../../server/types";

const T = UI_TEXT.studioCabinet.scheduleV2.column;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

export function MasterColumnHeader({ master }: { master: ScheduleMasterColumn }) {
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-card px-3 py-2.5">
      {master.avatarUrl ? (
        <ResilientImage
          src={master.avatarUrl}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg-input text-[10px] font-semibold text-text-sec ring-1 ring-border-subtle"
        >
          {initials(master.name)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-main">
          {master.name}
        </p>
        {master.reviewsCount > 0 ? (
          <p className="mt-0.5 text-[11px] text-text-sec">
            {T.ratingTemplate.replace("{value}", master.rating.toFixed(1))}
          </p>
        ) : null}
      </div>
    </div>
  );
}
