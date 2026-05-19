import { Building2 } from "lucide-react";
import { FocalImage } from "@/components/ui/focal-image";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  /** Display name shown in the chip. */
  name: string;
  /** Optional avatar; falls back to monogram. */
  avatarUrl: string | null;
  /** Studio name surfaced as the chip tagline. */
  studioName: string;
};

const T = UI_TEXT.studioCabinet.userChip;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

/**
 * Bottom-of-sidebar info chip — mirrors `MasterUserChip` as a quiet,
 * non-interactive card. Cross-cabinet navigation lives in the public
 * header (`auth-user-menu.tsx`), so the cabinet shell does not host
 * a duplicate switcher here. Logout and the platform profile are
 * reachable via that same public header / the `/logout` URL.
 */
export function StudioUserChip({ name, avatarUrl, studioName }: Props) {
  return (
    <div className="flex items-center gap-3 border-t border-border-subtle px-4 py-3">
      {avatarUrl ? (
        <FocalImage
          src={avatarUrl}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg-input text-xs font-semibold text-text-sec ring-1 ring-border-subtle"
        >
          {initialsOf(name)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-main">{name}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-text-sec">
          <Building2 className="h-3 w-3 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{T.currentContext.replace("{studio}", studioName)}</span>
        </p>
      </div>
    </div>
  );
}
