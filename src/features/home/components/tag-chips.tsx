import { Chip } from "@/components/ui/chip";

type TagItem = {
  id: string;
  name: string;
  slug: string;
  usageCount: number;
};

type Props = {
  tags: TagItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function TagChips({ tags, selectedId, onSelect }: Props) {
  return (
    <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
      {tags.map((tag) => (
        <Chip
          key={tag.id}
          type="button"
          onClick={() => onSelect(tag.id)}
          variant={selectedId === tag.id ? "active" : "default"}
        >
          {tag.name}
        </Chip>
      ))}
    </div>
  );
}
