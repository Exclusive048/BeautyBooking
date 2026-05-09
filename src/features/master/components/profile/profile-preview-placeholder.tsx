import { Eye } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.profile.preview;

/**
 * Right-column placeholder. Real client-card preview ships after the
 * public-pages redesign — until then the placeholder sets expectations
 * (eyebrow + title + body + footnote) so the column doesn't read as
 * "broken".
 */
export function ProfilePreviewPlaceholder() {
  return (
    <div className="space-y-3">
      <p className="px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        {T.eyebrow}
      </p>
      <div className="rounded-2xl border border-dashed border-border-subtle bg-bg-card/60 p-6 text-center">
        <Eye className="mx-auto mb-3 h-10 w-10 text-text-sec/40" aria-hidden />
        <p className="font-display text-base text-text-main">{T.title}</p>
        <p className="mt-2 text-xs leading-relaxed text-text-sec">{T.body}</p>
      </div>
      <p className="px-2 text-center text-[10px] text-text-sec">{T.footnote}</p>
    </div>
  );
}
