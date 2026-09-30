"use client";

import { ArrowDownUp } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select } from "@/components/ui/select";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  value: T;
  /** Значение по умолчанию: при выборе его `?sort=` из адреса убирается. */
  defaultValue: T;
  options: ReadonlyArray<Option<T>>;
  /** Подпись для диктора («Сортировка»). */
  label: string;
};

/**
 * Сортировка списка кабинета мастера, записанная в адрес (`?sort=`) —
 * 29.09 доработки · 22: одна реализация вместо двух почти одинаковых
 * `sort-select.tsx` (клиенты и уведомления). Меняет адрес через
 * `router.replace`, чтобы каждое переключение не плодило запись в истории;
 * страница остаётся серверной — гидратируется только этот список.
 */
export function UrlSortSelect<T extends string>({ value, defaultValue, options, label }: Props<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === defaultValue) params.delete("sort");
    else params.set("sort", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-card px-3 py-2 text-sm">
      <ArrowDownUp className="h-3.5 w-3.5 text-text-sec" aria-hidden />
      <span className="sr-only">{label}</span>
      <Select variant="borderless" value={value} onChange={(event) => handleChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
