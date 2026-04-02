"use client";

import { motion } from "framer-motion";
import { UI_TEXT } from "@/lib/ui/text";

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  usageCount: number;
  parentId: string | null;
};

type Props = {
  categories: CategoryItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

const LAYOUT_ID = "category-chip-active";

export function CategoryChips({ categories, selectedId, onSelect }: Props) {
  const chips = categories.filter((category) => !category.parentId);

  return (
    <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-1 scrollbar-hide sm:flex-wrap sm:overflow-visible">
      {/* "Все" chip — always first */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        className="relative shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        {selectedId === null ? (
          <motion.span
            layoutId={LAYOUT_ID}
            className="absolute inset-0 rounded-full bg-primary"
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
          />
        ) : null}
        <span className={`relative z-10 ${selectedId === null ? "text-white" : "text-text-sec"}`}>
          {UI_TEXT.home.filters.all}
        </span>
      </button>

      {chips.map((chip) => {
        const isActive = selectedId === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onSelect(isActive ? null : chip.id)}
            className="relative shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {isActive ? (
              <motion.span
                layoutId={LAYOUT_ID}
                className="absolute inset-0 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
              />
            ) : null}
            <span className={`relative z-10 ${isActive ? "text-white" : "text-text-sec"}`}>
              {chip.icon ? `${chip.icon} ` : ""}
              {chip.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
