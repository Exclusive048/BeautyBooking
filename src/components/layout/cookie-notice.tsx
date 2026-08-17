"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  consumeLegacyAcknowledgement,
  writeCookieNoticeAcknowledgement,
} from "@/lib/legal/cookie-notice";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * RKN-FIX-06 — informational cookie notice.
 *
 * Consumer only: every mechanic (cookie name, versioning, category grants,
 * legacy migration) lives in `@/lib/legal/cookie-notice`, and the rationale for
 * why this is a notice rather than a consent form is in that module's header.
 *
 * Mounting is decided by the SERVER (`app/layout.tsx` reads the cookie), so an
 * acknowledged visitor never receives this markup at all — no post-hydration
 * flash, which is what the old localStorage-only version could not avoid. This
 * component therefore renders visibly on its first client render too, matching
 * the SSR output exactly; the only thing the effect can do is hide it, and only
 * for the one-time localStorage migration case.
 */
export function CookieNotice() {
  const t = UI_TEXT.cookieNotice;
  const [dismissed, setDismissed] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    // Visitors who dismissed the pre-RKN-FIX-06 banner: honour it once, mirror
    // into the cookie so the server suppresses it from the next request on.
    if (consumeLegacyAcknowledgement()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legacy value is only readable after mount; server had no way to know
      setDismissed(true);
    }
  }, []);

  const acknowledge = () => {
    writeCookieNoticeAcknowledgement();
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      {dismissed ? null : (
        <motion.div
          key="cookie-notice"
          role="region"
          aria-label={t.regionLabel}
          initial={reduce ? false : { y: 80, opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: 80, opacity: 0 }}
          transition={
            reduce ? { duration: 0 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
          }
          className="fixed bottom-0 left-0 right-0 z-[45] p-3 pb-[calc(0.75rem+var(--safe-area-inset-bottom))] md:p-5 md:pb-[calc(1.25rem+var(--safe-area-inset-bottom))]"
        >
          <div className="mx-auto max-w-5xl rounded-2xl border border-border-subtle bg-bg-card/95 p-4 shadow-hover backdrop-blur-md md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <div className="flex items-start gap-3 md:flex-1">
                <div className="shrink-0 rounded-xl bg-primary/10 p-2.5">
                  <Cookie className="h-5 w-5 text-accent-text" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-sm font-medium text-text-main">{t.title}</p>
                  <p className="mt-0.5 text-sm text-text-sec">{t.text}</p>
                  <Link
                    href={LEGAL_DOCUMENTS.COOKIE_NOTICE.href}
                    className="mt-1 inline-block text-xs text-accent-text hover:underline"
                  >
                    {t.privacyLink}
                  </Link>
                </div>
              </div>

              <div className="flex md:shrink-0">
                <Button size="sm" onClick={acknowledge} className="flex-1 md:flex-none">
                  {t.acknowledge}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
