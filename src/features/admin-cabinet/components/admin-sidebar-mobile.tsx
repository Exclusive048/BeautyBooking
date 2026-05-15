"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { AdminSidebar } from "@/features/admin-cabinet/components/admin-sidebar";
import type { AdminPanelUser } from "@/features/admin-cabinet/types";
import { UI_TEXT } from "@/lib/ui/text";

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

  useEffect(() => {
    if (open) onClose();
    // Route change → close drawer. `open` intentionally excluded so we
    // don't immediately close it the moment it's opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={UI_TEXT.adminPanel.aria.sidebar}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-bg-page shadow-2xl"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label={UI_TEXT.adminPanel.mobile.closeMenu}
              className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-sec transition-colors hover:bg-bg-input/70 hover:text-text-main"
            >
              <X className="h-4 w-4" />
            </button>
            <AdminSidebar user={user} />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
