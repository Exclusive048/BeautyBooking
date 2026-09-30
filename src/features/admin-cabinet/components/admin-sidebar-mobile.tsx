"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import { X } from "lucide-react";
import { AdminSidebar } from "@/features/admin-cabinet/components/admin-sidebar";
import type { AdminPanelUser } from "@/features/admin-cabinet/types";
import { useOverlayA11y } from "@/components/ui/use-modal-a11y";
import { MOTION } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
  user: AdminPanelUser;
};

/**
 * Off-canvas mobile drawer wrapping the same `<AdminSidebar>` rendered
 * on desktop. Slides in from the left with a backdrop. Auto-closes on
 * route change so navigating a nav item never leaves the drawer open
 * over the new page.
 */
export function AdminSidebarMobile({ open, onClose, user }: Props) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) onClose();
    // Route change → close drawer. `open` intentionally excluded so we
    // don't immediately close it the moment it's opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // UI-13 — `aria-modal="true"` ниже это ОБЕЩАНИЕ вспомогательной технологии,
  // что фокус заперт внутри; здесь оно было ложным. Свой Escape был, а
  // focus-trap, начального и возвращаемого фокуса и блокировки прокрутки
  // фона не было вовсе: Tab уходил на страницу под оверлеем, скринридер —
  // следом. Ложное обещание хуже отсутствующего, потому что AT перестаёт
  // предлагать пользователю обходные пути. Контракт взят общий — тот же,
  // что у `ModalSurface` и `Drawer`; собственный Escape убран, он в нём есть.
  // Разметка и анимация не тронуты намеренно: перевод на `Drawer` поменял бы
  // ширину, chrome и тайминги, то есть внешний вид (см. ledger).
  useOverlayA11y({ open, onClose, containerRef: panelRef });

  return (
    <AnimatePresence>
      {open ? (
        <m.div
          className="fixed inset-0 z-modal lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={UI_TEXT.adminPanel.aria.sidebar}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.micro}
        >
          <m.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={MOTION.micro}
          />
          <m.div
            ref={panelRef}
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-bg-page shadow-2xl"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={MOTION.base}
          >
            <Button
              variant="wrapper"
              onClick={onClose}
              aria-label={UI_TEXT.adminPanel.mobile.closeMenu}
              className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-sec transition-colors hover:bg-bg-input/70 hover:text-text-main"
            >
              <X className="h-4 w-4" />
            </Button>
            <AdminSidebar user={user} />
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
