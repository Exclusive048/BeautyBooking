import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const CTA_HREF = "/become-master";

export function FooterCTA() {
  return (
    <div className="lux-card rounded-[24px] bg-bg-card p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="text-[18px] font-semibold text-text-main">
            🎨 {UI_TEXT.footer.cta.title}
          </div>
          <p className="text-sm text-text-sec">{UI_TEXT.footer.cta.subtitle}</p>
        </div>
        <Button asChild size="md">
          <Link href={CTA_HREF}>{UI_TEXT.footer.cta.button}</Link>
        </Button>
      </div>
    </div>
  );
}
