"use client";

import { cn } from "@/lib/cn";
import { normalizeSocialLink, socialHostLabel, type SocialKind } from "@/lib/providers/social-links";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * FEAT-PROVIDER-SOCIALS — live preview / validation line shown under a social
 * link cabinet input (studio + master). Uses the SAME pure normalizer the
 * server validates with, so the preview always matches what will be stored.
 * - empty  → nothing
 * - ok     → «Ссылка: vk.ru/handle»
 * - invalid→ red hint naming the expected host (won't save)
 */
export function SocialLinkPreview({
  kind,
  value,
  className,
}: {
  kind: SocialKind;
  value: string;
  className?: string;
}) {
  const T = UI_TEXT.social;
  const result = normalizeSocialLink(kind, value);

  if (result.status === "empty") return null;

  if (result.status === "invalid") {
    return (
      <p className={cn("mt-1 text-xs text-danger-text", className)} role="alert">
        {T.invalidTemplate.replace("{host}", socialHostLabel(kind))}
      </p>
    );
  }

  return (
    // `break-all`: код приглашения MAX / Telegram — длинный и без пробелов.
    <p className={cn("mt-1 break-all text-xs text-success-text", className)}>
      {T.previewTemplate.replace("{label}", result.url.replace(/^https:\/\//, ""))}
    </p>
  );
}
