import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const CTA_HREF = "/become-master";

export function FooterCTA() {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="text-[18px] font-semibold text-neutral-900 dark:text-neutral-100">
            🎨 {UI_TEXT.footer.cta.title}
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{UI_TEXT.footer.cta.subtitle}</p>
        </div>
        <Button asChild size="md">
          <Link href={CTA_HREF}>{UI_TEXT.footer.cta.button}</Link>
        </Button>
      </div>
    </div>
  );
}
