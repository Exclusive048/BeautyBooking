"use client";

import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { CatalogSidebar, type CatalogFilters } from "@/features/catalog/components/catalog-sidebar";
import type { CatalogPriceBucket } from "@/lib/catalog/catalog.service";
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
  priceDistribution?: ReadonlyArray<CatalogPriceBucket>;
};

/**
 * MODAL-UNIFY-IMPL-A: shell migrated to the unified `<Drawer>`
 * primitive. Public API preserved (`MobileFilterDrawer({open,
 * activeCount, onClose, onApply, onReset, ...filterProps})`).
 * Filter business logic (`CatalogSidebar`) reused verbatim.
 */
export function MobileFilterDrawer({
  open,
  activeCount,
  onClose,
  onApply,
  onReset,
  ...filterProps
}: Props) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="bottom"
      size="lg"
      title={UI_TEXT.catalog.sidebar.title}
      ariaLabel={UI_TEXT.catalog.sidebar.title}
      footer={
        <div className="flex gap-3">
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
      }
    >
      <div className="px-5 py-4">
        <CatalogSidebar
          {...filterProps}
          onReset={onReset}
          activeCount={activeCount}
          showHeader={false}
        />
      </div>
    </Drawer>
  );
}
