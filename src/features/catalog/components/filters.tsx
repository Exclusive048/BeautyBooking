import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const quick = ["Маникюр", "Ресницы", "Брови", "Барбер", "Массаж", "Визаж"];

export function CatalogFilters() {
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-4 md:p-5">
      <div className="grid gap-3 md:grid-cols-3">
        <Input placeholder="Услуга (напр. маникюр)" />
        <Input placeholder="Район / метро" />
        <Input placeholder="Цена до (напр. 15000)" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {quick.map((q) => (
          <button
            key={q}
            className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
          >
            {q}
          </button>
        ))}
        <Badge className="ml-auto">MVP: фильтры статические</Badge>
      </div>
    </div>
  );
}
