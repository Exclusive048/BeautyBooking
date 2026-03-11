import { X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
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

export function CategoryChips({ categories, selectedId, onSelect }: Props) {
  const chips = categories.filter((category) => !category.parentId);

  return (
    <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
      {selectedId ? (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5 text-xs text-text-sec transition-colors hover:bg-white/8"
        >
          <X className="h-3 w-3" />
          {UI_TEXT.home.filters.reset}
        </button>
      ) : null}

      {chips.map((chip) => (
        <Chip
          key={chip.id}
          type="button"
          onClick={() => onSelect(selectedId === chip.id ? null : chip.id)}
          variant={selectedId === chip.id ? "active" : "default"}
        >
          {chip.icon ? `${chip.icon} ` : ""}
          {chip.name}
        </Chip>
      ))}
    </div>
  );
}
