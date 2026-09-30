"use client";

import { Camera, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ServiceSearchInput,
  type AutocompleteCategory,
} from "@/features/catalog/components/service-search-input";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  serviceQuery: string;
  citySlug?: string | null;
  onServiceQueryChange: (value: string) => void;
  onCategorySelectFromSearch: (category: AutocompleteCategory) => void;
  onSubmit: () => void;
  showPhotoSearch?: boolean;
  onOpenPhotoSearch?: () => void;
};

const T = UI_TEXT.catalog2.searchBar;

/**
 * Десктопная строка поиска `/catalog`: поле с автодополнением + поиск по фото
 * + «Найти» в одной карточке.
 *
 * CATALOG-COMPACT-SEARCH — второй ряд «Когда» (Сегодня / Завтра / Календарь +
 * Утро / День / Вечер / Свой диапазон) удалён: выдача каталога его не
 * учитывала. Дата, кроме «сегодня», в `searchCatalog` не читается вовсе, а
 * пресеты времени включали поиск по окошкам, которому нужна конкретная услуга
 * (`serviceId`) — выбрать её в каталоге было негде, и любой пресет упирался в
 * «Сначала выберите услугу». Рабочая половина («сегодня») живёт фильтром
 * «Свободно сегодня». Фильтр по дате и времени — `CATALOG-DATE-TIME-FILTER` в
 * BACKLOG.
 */
export function CatalogSearchBar({
  serviceQuery,
  citySlug,
  onServiceQueryChange,
  onCategorySelectFromSearch,
  onSubmit,
  showPhotoSearch = false,
  onOpenPhotoSearch,
}: Props) {
  return (
    <div className="flex items-center gap-2 overflow-visible rounded-2xl border border-border-subtle bg-bg-card p-2 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <ServiceSearchInput
        value={serviceQuery}
        onChange={onServiceQueryChange}
        onCategorySelect={onCategorySelectFromSearch}
        onSubmit={onSubmit}
        citySlug={citySlug}
        className="flex-1"
      />

      {showPhotoSearch && onOpenPhotoSearch ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-xl text-text-sec hover:text-text-main"
          aria-label={UI_TEXT.home.visualSearch.button}
          title={UI_TEXT.home.visualSearch.button}
          onClick={onOpenPhotoSearch}
        >
          <Camera className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}

      <Button
        type="button"
        variant="primary"
        size="md"
        className="shrink-0 rounded-xl px-5"
        onClick={onSubmit}
      >
        <Search className="h-4 w-4" aria-hidden />
        {T.findCta}
      </Button>
    </div>
  );
}
