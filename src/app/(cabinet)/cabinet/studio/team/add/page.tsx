import Link from "next/link";

export default function AddStudioMasterPage() {
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Добавить мастера</h2>
        <p className="text-sm text-neutral-600">Форма добавления будет доступна в следующем шаге.</p>
      </header>
      <div className="rounded-2xl border p-5 text-sm text-neutral-600">
        Пока можно перейти в Команду и управлять существующими мастерами.
      </div>
      <Link href="/cabinet/studio/team" className="inline-flex rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50">
        Вернуться в Команду
      </Link>
    </section>
  );
}

