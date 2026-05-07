import { AnnouncementCard } from "@/features/master/components/dashboard/announcement-card";
import { ANNOUNCEMENTS } from "@/features/master/lib/announcements";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard.announcements;

/**
 * Right-column "Анонсы и советы" panel — three static platform messages.
 * Static-only by design; promoting this to a CMS is a future enhancement
 * (see `announcements.ts` header comment).
 */
export function AnnouncementsSection() {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-text-main">{T.title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {T.from}
        </span>
      </header>

      <div className="space-y-3">
        {ANNOUNCEMENTS.map((item) => (
          <AnnouncementCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
