"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CatalogSidebar, type CatalogFilters } from "@/features/catalog/components/catalog-sidebar";
import { UI_TEXT } from "@/lib/ui/text";

type Props = CatalogFilters & {
  open: boolean;
  activeCount: number;
  onClose: () => void;
  onGlobalCategoryChange: (value: string | null) => void;
  onDistrictChange: (value: string) => void;
  onRatingMinChange: (value: string) => void;
  onPriceChange: (min: string, max: string) => void;
  onToggleHot: () => void;
  onEntityTypeChange: (value: "all" | "master" | "studio") => void;
  onToggleAvailableToday: () => void;
  onReset: () => void;
  onApply: () => void;
};

export function MobileFilterDrawer({
  open,
  activeCount,
  onClose,
  onApply,
  onReset,
  ...filterProps
}: Props) {
  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[90dvh] flex-col rounded-t-3xl border-t border-border bg-background shadow-2xl"
            role="dialog"
            aria-modal
            aria-label={UI_TEXT.catalog.sidebar.title}
          >
            {/* Handle */}
            <div className="flex justify-center py-2">
              <div className="h-1 w-10 rounded-full bg-border" aria-hidden />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 pb-3">
              <h2 className="text-base font-semibold">
                {UI_TEXT.catalog.sidebar.title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={UI_TEXT.common.close}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {/* Scrollable filter body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <CatalogSidebar
                {...filterProps}
                onReset={onReset}
                activeCount={activeCount}
                showHeader={false}
              />
            </div>

            {/* Footer */}
            <div className="flex gap-3 border-t border-border px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {activeCount > 0 ? (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    onReset();
                    onClose();
                  }}
                  className="shrink-0 rounded-full"
                >
                  {UI_TEXT.catalog.sidebar.reset}
                </Button>
              ) : null}
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  onApply();
                  onClose();
                }}
                className="flex-1 rounded-full"
              >
                {UI_TEXT.catalog.sidebar.apply}
              </Button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
