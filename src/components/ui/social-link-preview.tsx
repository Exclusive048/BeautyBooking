"use client";

import { cn } from "@/lib/cn";
import { normalizeSocialLink, type SocialKind } from "@/lib/providers/social-links";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * FEAT-PROVIDER-SOCIALS — live preview / validation line shown under a VK or
 * Instagram cabinet input (studio + master). Uses the SAME pure normalizer the
 * server validates with, so the preview always matches what will be stored.
 * - empty  → nothing
 * - ok     → «Ссылка: vk.com/handle»
 * - invalid→ red hint (won't save)
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
      <p className={cn("mt-1 text-xs text-red-600 dark:text-red-400", className)} role="alert">
        {T.invalid}
      </p>
    );
  }

  return (
    <p className={cn("mt-1 text-xs text-emerald-600 dark:text-emerald-400", className)}>
      {T.previewTemplate.replace("{label}", result.url.replace(/^https:\/\//, ""))}
    </p>
  );
}
