import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

type DashboardCardItem = {
  title: string;
  value: string;
  subtitle: string;
  href: string;
  muted?: boolean;
};

type Props = {
  items: DashboardCardItem[];
  className?: string;
};

export function DashboardNavCards({ items, className }: Props) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2", className)}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="group block">
          <Card className="h-full transition-all duration-300 hover:-translate-y-0.5 hover:shadow-hover">
            <CardContent className="flex h-full flex-col justify-between gap-4 p-5 md:p-6">
              <div>
                <div className="text-sm text-text-sec">{item.title}</div>
                <div
                  className={cn(
                    "mt-1 text-2xl font-semibold",
                    item.muted ? "text-text-sec" : "text-text-main"
                  )}
                >
                  {item.value}
                </div>
                <div className={cn("mt-1 text-sm text-text-sec", item.muted ? "text-text-sec/80" : "")}>
                  {item.subtitle}
                </div>
              </div>
              <div className="flex items-center justify-between text-sm text-text-sec">
                <span>{UI_TEXT.actions.goTo}</span>
                <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
