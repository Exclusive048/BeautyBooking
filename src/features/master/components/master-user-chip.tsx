import { ResilientImage } from "@/components/ui/resilient-image";

type Props = {
  name: string;
  avatarUrl: string | null;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

/**
 * Bottom-of-sidebar block: avatar + display name. Styled as a quiet card — no
 * hover affordance because clicking is owned by the explicit "Профиль" nav
 * item above.
 *
 * Тариф здесь не показывается (решение владельца 2026-10-31): вид подписки —
 * один раз, плашкой на главной кабинета (`master-dashboard-page.tsx`).
 */
export function MasterUserChip({ name, avatarUrl }: Props) {
  const initialsAvatar = (
    <span
      aria-hidden
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg-input text-xs font-semibold text-text-sec ring-1 ring-border-subtle"
    >
      {initialsOf(name)}
    </span>
  );

  return (
    <div className="flex items-center gap-3 border-t border-border-subtle px-4 py-3">
      {/* RES-30: инициалы — замена на ЛЮБОЕ «фото показать нечем», а не только
          на `avatarUrl === null`. Раньше битый или неоптимизируемый URL давал
          картинку-плейсхолдер портфолио внутри круглого аватара. */}
      {avatarUrl ? (
        <ResilientImage
          src={avatarUrl}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
          fallback={initialsAvatar}
        />
      ) : (
        initialsAvatar
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-main">{name}</p>
      </div>
    </div>
  );
}
