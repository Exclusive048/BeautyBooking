import { cn } from "@/lib/cn";
import { getAvatarHue, initialsFromName } from "@/features/admin-cabinet/users/lib/avatar-hue";

type Props = {
  userId: string;
  name: string;
  /** Size in Tailwind h/w units. 8 = 32px, 10 = 40px. */
  size?: 8 | 10;
  className?: string;
};

/** Deterministic-hue gradient avatar. We compute a stable hue from the
 * user id so a user's avatar colour doesn't shuffle between page
 * reloads. Inline `style` is the cleanest way to feed a dynamic hue
 * into Tailwind without generating per-user classes. */
export function UserAvatar({ userId, name, size = 8, className }: Props) {
  const hue = getAvatarHue(userId);
  const initials = initialsFromName(name);
  const dim = size === 10 ? "h-10 w-10 text-sm" : "h-8 w-8 text-[11px]";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        dim,
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 40) % 360} 70% 48%))`,
      }}
    >
      {initials}
    </span>
  );
}
