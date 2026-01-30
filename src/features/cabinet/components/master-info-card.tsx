type StudioInfo = {
  id: string;
  name: string;
};

type Props = {
  address: string;
  studio: StudioInfo | null;
};

export function MasterInfoCard({ address, studio }: Props) {
  const inputClass =
    "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200";

  return (
    <div className="rounded-2xl border p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Информация о мастере</h3>
          <p className="mt-1 text-sm text-neutral-600">
            Дополните профиль мастера. Пока без логики сохранения.
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          Добавить фото
        </button>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-neutral-600">Адрес</div>
        <input
          className={inputClass}
          defaultValue={address}
          placeholder="Город, улица, дом..."
        />
      </div>

      <div className="rounded-2xl border p-4">
        <div className="text-sm font-semibold">Текущая студия</div>
        {studio ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-700">
            <div>{studio.name}</div>
            <form action={`/api/studios/${studio.id}/leave`} method="post">
              <button
                type="submit"
                className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
              >
                Выйти из студии
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-2 text-sm text-neutral-600">Вы не привязаны к студии.</div>
        )}
      </div>
    </div>
  );
}
