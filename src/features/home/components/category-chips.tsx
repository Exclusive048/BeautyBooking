import { Chip } from "@/components/ui/chip";

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  usageCount: number;
};

type Props = {
  categories: CategoryItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export function CategoryChips({ categories, selectedId, onSelect }: Props) {
  const chips: Array<{ id: string | null; name: string; icon: string | null }> = [
    { id: null, name: "Все", icon: null },
    ...categories.map((category) => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
    })),
  ];

  return (
    <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
      {chips.map((chip) => (
        <Chip
          key={chip.id ?? "all"}
          type="button"
          onClick={() => onSelect(chip.id)}
          variant={selectedId === chip.id ? "active" : "default"}
        >
          {chip.icon ? `${chip.icon} ` : ""}
          {chip.name}
        </Chip>
      ))}
    </div>
  );
}
