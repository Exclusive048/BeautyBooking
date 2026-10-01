import * as UI_TEXT from "@/lib/ui/text";

export function SettingsHeader() {
  const t = UI_TEXT.adminPanel.settings.header;
  return (
    <header className="flex flex-col gap-1">
      <p className="eyebrow text-2xs">
        {t.caption}
      </p>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-text-main">
        {t.title}
      </h2>
    </header>
  );
}
