import { UI_TEXT } from "@/lib/ui/text";

export function SettingsHeader() {
  const t = UI_TEXT.adminPanel.settings.header;
  return (
    <header className="flex flex-col gap-1">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-sec">
        {t.caption}
      </p>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-text-main">
        {t.title}
      </h2>
    </header>
  );
}
