import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  breadcrumb: string;
  children: React.ReactNode;
};

export function InfoPageLayout({ breadcrumb, children }: Props) {
  return (
    <div>
      <nav
        aria-label="breadcrumb"
        className="-mt-2 mb-1 flex items-center gap-1 px-1 text-xs text-text-sec/70"
      >
        <Link href="/" className="hover:text-text-main transition-colors">
          {UI_TEXT.common.home}
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
        <span className="text-text-sec">{breadcrumb}</span>
      </nav>
      {children}
    </div>
  );
}
