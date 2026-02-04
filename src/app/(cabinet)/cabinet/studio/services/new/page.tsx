import Link from "next/link";

export default function NewStudioServicePage() {
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Добавить услугу</h2>
        <p className="text-sm text-neutral-600">Форма создания услуги будет добавлена в следующем проходе.</p>
      </header>
      <div className="rounded-2xl border p-5 text-sm text-neutral-600">
        Пока используйте текущий список услуг и назначение мастеров.
      </div>
      <Link
        href="/cabinet/studio/services"
        className="inline-flex rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
      >
        Вернуться к услугам
      </Link>
    </section>
  );
}

