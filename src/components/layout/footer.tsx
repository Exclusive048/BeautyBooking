export function Footer() {
  return (
    <footer className="mt-8">
      <div className="mx-auto max-w-6xl px-4 pb-10">
        <div className="rounded-[22px] border border-border-subtle/80 bg-bg-card/65 px-4 py-4 text-sm text-text-sec shadow-sm">
          © {new Date().getFullYear()} BeautyHub. MVP
        </div>
      </div>
    </footer>
  );
}
