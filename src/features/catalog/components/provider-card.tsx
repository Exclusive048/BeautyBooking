import Link from "next/link";
import type { ProviderCardModel } from "../model/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { moneyRUB } from "@/lib/format";

export function ProviderCard({ p }: { p: ProviderCardModel }) {
  return (
    <Link href={`/providers/${p.id}`} className="block">
      <Card className="transition hover:-translate-y-[1px] hover:border-[rgb(var(--accent))]/40 hover:shadow-[0_14px_30px_rgba(198,169,126,0.2)]">
        <CardContent className="p-5 md:p-6 h-full flex flex-col gap-4">
          <div className="flex items-start gap-4 min-h-[72px]">
            <div className="h-12 w-12 rounded-2xl bg-[rgb(var(--muted))]" />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-[rgb(var(--text))]">
                  {p.name}
                </h3>
                <Badge className="bg-[rgb(var(--accent-2))] text-[rgb(var(--text))] border-transparent">
                  {p.type === "MASTER" ? "Мастер" : "Студия"}
                </Badge>
              </div>

              <p className="mt-1 line-clamp-2 text-sm text-[rgb(var(--text-muted))]">
                {p.tagline}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 min-h-[28px]">
            {p.categories.slice(0, 3).map((c) => (
              <Badge key={c}>{c}</Badge>
            ))}
          </div>

          <div className="mt-auto space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--muted))] px-2 py-1 text-[rgb(var(--text))]">
                <span className="font-semibold">{p.rating.toFixed(1)}</span>{" "}
                <span className="text-[rgb(var(--text-muted))]">({p.reviews})</span>
              </div>

              <div className="text-[rgb(var(--text))]">
                от <span className="font-semibold">{moneyRUB(p.priceFrom)}</span>
              </div>
            </div>

            <div className="text-xs text-[rgb(var(--text-muted))]">
              {p.district} · {p.address}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}