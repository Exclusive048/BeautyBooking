export function Footer() {
  return (
    <footer className="border-t border-neutral-200">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="text-sm text-neutral-600">© {new Date().getFullYear()} BeautyHub. MVP.</div>
        <div className="mt-2 text-xs text-neutral-500">
          Важно: это демо-верстка со статичными данными. Дальше подключим API и авторизацию.
        </div>
      </div>
    </footer>
  );
}
