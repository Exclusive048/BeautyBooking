import { Chip } from "@/components/ui/chip";

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  usageCount: number;
};

type Props = {
  categories: CategoryItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function CategoryChips({ categories, selectedId, onSelect }: Props) {
  return (
    <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
      {categories.map((category) => (
        <Chip
          key={category.id}
          type="button"
          onClick={() => onSelect(category.id)}
          variant={selectedId === category.id ? "active" : "default"}
        >
          {category.icon} {category.name}
        </Chip>
      ))}
    </div>
  );
}
