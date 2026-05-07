/**
 * Loading placeholder shown in the right pane while
 * `ClientDetailPanel` fetches detail data after a row click. Layout
 * mirrors the loaded state (header / stats / notes / history) so the
 * shift on data arrival is minimal — no jump from "small placeholder"
 * to "large card".
 */
export function ClientDetailSkeleton() {
  return (
    <div
      role="status"
      aria-label="Загрузка клиента"
      className="animate-pulse rounded-2xl border border-border-subtle bg-bg-card p-5"
    >
      <div className="flex items-start gap-4 border-b border-border-subtle pb-4">
        <div className="h-14 w-14 shrink-0 rounded-full bg-bg-input" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-40 rounded bg-bg-input" />
          <div className="h-3 w-56 rounded bg-bg-input" />
          <div className="flex gap-2 pt-1">
            <div className="h-5 w-16 rounded-full bg-bg-input" />
            <div className="h-5 w-20 rounded-full bg-bg-input" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-b border-border-subtle py-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-3 w-16 rounded bg-bg-input" />
            <div className="h-6 w-20 rounded bg-bg-input" />
          </div>
        ))}
      </div>

      <div className="space-y-2 border-b border-border-subtle py-4">
        <div className="h-3 w-24 rounded bg-bg-input" />
        <div className="h-12 rounded bg-bg-input" />
      </div>

      <div className="space-y-2 py-4">
        <div className="h-3 w-24 rounded bg-bg-input" />
        <div className="h-10 rounded bg-bg-input" />
        <div className="h-10 rounded bg-bg-input" />
        <div className="h-10 rounded bg-bg-input" />
      </div>
    </div>
  );
}
