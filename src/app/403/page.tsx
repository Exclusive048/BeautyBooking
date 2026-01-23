export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Нет доступа</h1>
      <p className="mt-2 text-neutral-600">
        У вашей учетной записи нет прав для этой страницы.
      </p>
    </div>
  );
}
