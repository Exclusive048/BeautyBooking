"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  open: boolean;
  onClose: () => void;
};

const T = UI_TEXT.catalog2.loginRequired;

/**
 * Modal shown when an anonymous visitor tries to favourite a master.
 * Built as a generic component so future "save action requires login"
 * surfaces (e.g. notifications opt-in, gift-card purchase) can reuse
 * it.
 *
 * hotfix-master-cabinet-closure: wrapped in `<ModalSurface>` so the
 * dialog inherits the same Portal-to-body, body-scroll-lock, ESC
 * handler and viewport-anchored positioning the rest of the cabinet
 * modals got in `modals-investigation`. Previously this was the only
 * hand-rolled `fixed inset-0` centred modal still in the tree.
 *
 * The `?next=` redirect is computed via `usePathname()` +
 * `useSearchParams()` rather than `window.location` so the component
 * is safe under SSR / RSC.
 */
export function LoginRequiredModal({ open, onClose }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const queryString = searchParams.toString();
  const nextHref = queryString ? `${pathname}?${queryString}` : pathname;
  const loginHref = `/login?next=${encodeURIComponent(nextHref)}`;

  return (
    <ModalSurface open={open} onClose={onClose} className="max-w-md">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <Heart className="h-6 w-6" aria-hidden />
      </div>

      <h3 className="mb-2 text-center font-display text-xl text-text-main">{T.title}</h3>
      <p className="mb-6 text-center leading-relaxed text-text-sec">{T.description}</p>

      <div className="flex gap-3">
        <Button asChild variant="primary" className="flex-1">
          <Link href={loginHref}>{T.loginCta}</Link>
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {T.closeCta}
        </Button>
      </div>
    </ModalSurface>
  );
}
