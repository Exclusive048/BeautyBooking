import { Card } from "@/components/ui/card";

export function WorksGrid({ works }: { works: Array<{ id: string; title: string }> }) {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
      {works.map((w) => (
        <Card key={w.id} className="aspect-square overflow-hidden hover:shadow-sm transition">
          <div className="h-full w-full bg-neutral-100" />
        </Card>
      ))}
    </div>
  );
}
