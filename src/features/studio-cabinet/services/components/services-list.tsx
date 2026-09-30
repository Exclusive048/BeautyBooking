import { Scissors } from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  StudioServiceCategoryRow,
  StudioServiceListItem,
} from "../lib/types";
import { ServiceListItem } from "./service-list-item";
import { ServicesSearch } from "./services-search";

const T = UI_TEXT.studioCabinet.servicesV2.list;

type Props = {
  items: StudioServiceListItem[];
  selectedServiceId: string | null;
  search: string;
  selectedCategory: StudioServiceCategoryRow | null;
};

export function ServicesList({
  items,
  selectedServiceId,
  search,
  selectedCategory,
}: Props) {
  return (
    <div className="space-y-3">
      <ServicesSearch
        initial={search}
        categoryTitle={selectedCategory?.title ?? null}
      />

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border-subtle bg-bg-card p-8 text-center">
          <Scissors className="h-8 w-8 text-text-sec/40" aria-hidden />
          <p className="text-sm text-text-sec">{T.empty}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((service) => (
            <li key={service.id}>
              <ServiceListItem
                service={service}
                isSelected={service.id === selectedServiceId}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
