import { UI_TEXT } from "@/lib/ui/text";
import { CategoryChips } from "@/features/home/components/category-chips";

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
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
};

export function HomeFilters({
  categories,
  selectedCategoryId,
  onSelectCategory,
}: Props) {
  return (
    <div className="sticky top-[var(--topbar-h)] z-20 -mx-4 border-b border-border-subtle/70 bg-bg-page/90 backdrop-blur-md md:static md:mx-0 md:border-b-0 md:bg-transparent md:backdrop-blur-none">
      <div className="px-4 py-2 md:px-0 md:py-0">
        <div className="rounded-[22px] border border-border-subtle/70 bg-bg-card/75 p-3 shadow-card backdrop-blur">
          <div>
            <div className="text-[11px] font-semibold uppercase text-text-sec">
              {UI_TEXT.home.filters.categoriesTitle}
            </div>
            <CategoryChips
              categories={categories}
              selectedId={selectedCategoryId}
              onSelect={onSelectCategory}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
