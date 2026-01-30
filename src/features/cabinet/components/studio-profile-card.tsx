type Props = {
  provider: {
    name: string;
    tagline: string;
    address: string;
    district: string;
    categories: string[];
  };
};

export function StudioProfileCard({ provider }: Props) {
  const inputClass =
    "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200";

  return (
    <div className="rounded-2xl border p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Профиль студии</h3>
          <p className="mt-1 text-sm text-neutral-600">
            Информация о студии и контакты. Пока без логики сохранения.
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          Добавить фото
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <div className="text-xs font-medium text-neutral-600">Название</div>
          <input className={inputClass} defaultValue={provider.name} />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-neutral-600">Район</div>
          <input className={inputClass} defaultValue={provider.district} />
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-neutral-600">Описание</div>
        <input className={inputClass} defaultValue={provider.tagline} />
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-neutral-600">Адрес</div>
        <input className={inputClass} defaultValue={provider.address} />
      </div>

      {provider.categories.length ? (
        <div className="space-y-1">
          <div className="text-xs font-medium text-neutral-600">Категории</div>
          <div className="flex flex-wrap gap-2 text-xs text-neutral-700">
            {provider.categories.map((c) => (
              <span key={c} className="rounded-full border px-3 py-1">
                {c}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
