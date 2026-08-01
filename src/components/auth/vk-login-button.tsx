"use client";

import { Button } from "@/components/ui/button";
import { withConsentQuery, type SocialConsent } from "@/components/auth/social-consent";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import { env } from "@/lib/env";

type VkLoginButtonProps = {
  iconOnly?: boolean;
  className?: string;
  /**
   * RKN-FIX-01: VK login can CREATE an account, so it is a registration path
   * and needs consent like any other. Omitted → legacy plain link (the only
   * consent-free case the server allows is an already-signed-in user linking
   * VK to an existing account).
   */
  consent?: SocialConsent;
  /**
   * QA-001: VK-enabled flag resolved SERVER-side and passed down so server +
   * client render the same branch (env-via-alias is `undefined` on the client →
   * server renders the button, client renders `null` → hydration mismatch). When
   * provided the prop wins; omitting it keeps the legacy env fallback.
   */
  enabled?: boolean;
};

function VkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.525-2.046-1.712-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.558c0 .424-.135.678-1.253.678-1.846 0-3.896-1.12-5.335-3.202C5.37 10.716 4.53 8.64 4.53 8.182c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.677.864 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.743c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.254-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.763-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.78 1.203 1.253.745.847 1.32 1.558 1.473 2.048.17.491-.085.745-.576.745z" />
    </svg>
  );
}

export default function VkLoginButton({
  iconOnly = false,
  className,
  enabled,
  consent,
}: VkLoginButtonProps) {
  // QA-001: prefer the server-passed prop (deterministic across SSR/CSR).
  const vkEnabled = enabled !== undefined ? enabled : String(env.NEXT_PUBLIC_VK_ENABLED) === "true";
  if (!vkEnabled) return null;

  const label = UI_TEXT.auth.vk.loginButton;
  const blockedByConsent = consent !== undefined && !consent.granted;
  const href = withConsentQuery("/api/auth/vk/start", consent);

  // Consent not yet given → a real disabled control, not a link that would be
  // refused server-side. Same treatment on both variants.
  if (blockedByConsent) {
    if (iconOnly) {
      return (
        <button type="button" disabled aria-label={label} title={label} className={cn(className, "opacity-50")}>
          <VkIcon className="h-5 w-5 text-[#0077FF]" />
          <span className="sr-only">{label}</span>
        </button>
      );
    }
    return (
      <Button variant="secondary" size="lg" className="w-full gap-2" disabled aria-label={label}>
        <VkIcon className="h-4 w-4 text-[#0077FF]" />
        {label}
      </Button>
    );
  }

  // FIX-24 (Item 3): plain <a>, NOT next/link. `/api/auth/vk/start` 302s to
  // id.vk.ru — a next/link RSC-prefetches it (cross-origin fetch → CORS error),
  // and a client-side nav can't follow the external redirect. A plain anchor
  // does a top-level browser navigation that follows the redirect cleanly and
  // is never prefetched.
  if (iconOnly) {
    return (
      <a href={href} aria-label={label} title={label} className={cn(className)}>
        <VkIcon className="h-5 w-5 text-[#0077FF]" />
        <span className="sr-only">{label}</span>
      </a>
    );
  }

  return (
    <Button asChild variant="secondary" size="lg" className="w-full gap-2">
      <a href={href} aria-label={label}>
        <VkIcon className="h-4 w-4 text-[#0077FF]" />
        {label}
      </a>
    </Button>
  );
}

