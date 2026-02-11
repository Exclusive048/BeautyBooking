import { UI_TEXT } from "@/lib/ui/text";
import { CategoryChips } from "@/features/home/components/category-chips";
import { TagChips } from "@/features/home/components/tag-chips";

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  usageCount: number;
};

type TagItem = {
  id: string;
  name: string;
  slug: string;
  usageCount: number;
};

type Props = {
  categories: CategoryItem[];
  tags: TagItem[];
  selectedCategoryId: string | null;
  selectedTagId: string | null;
  onSelectCategory: (id: string) => void;
  onSelectTag: (id: string) => void;
};

export function HomeFilters({
  categories,
  tags,
  selectedCategoryId,
  selectedTagId,
  onSelectCategory,
  onSelectTag,
}: Props) {
  return (
    <div className="sticky top-[calc(var(--topbar-h)+12px)] z-20">
      <div className="rounded-[22px] border border-border-subtle/70 bg-bg-card/75 p-3 shadow-card backdrop-blur">
        <div className="space-y-3">
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
          <div>
            <div className="text-[11px] font-semibold uppercase text-text-sec">
              {UI_TEXT.home.filters.tagsTitle}
            </div>
            <TagChips tags={tags} selectedId={selectedTagId} onSelect={onSelectTag} />
          </div>
        </div>
      </div>
    </div>
  );
}
