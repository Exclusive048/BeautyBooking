import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.scheduleV2.column;

export function DisabledMasterOverlay() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 z-10 flex items-center justify-center bg-[repeating-linear-gradient(45deg,rgb(var(--bg-input)/0.4),rgb(var(--bg-input)/0.4)_8px,rgb(var(--bg-input)/0.2)_8px,rgb(var(--bg-input)/0.2)_16px)]"
    >
      <span className="rounded-full border border-border-subtle bg-bg-card/90 px-3 py-1 text-xs font-medium text-text-sec backdrop-blur">
        {T.unavailable}
      </span>
    </div>
  );
}
