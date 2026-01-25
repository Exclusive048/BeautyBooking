import Link from "next/link";
import type { ProviderCardModel } from "../model/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { moneyRUB } from "@/lib/format";

export function ProviderCard({ p }: { p: ProviderCardModel }) {
  return (
    <Link href={`/providers/${p.id}`} className="block">
      <Card className="transition hover:shadow-md">
        <CardContent className="p-5 md:p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-neutral-900/10" />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-neutral-900">{p.name}</h3>
                <Badge>{p.type === "MASTER" ? "Мастер" : "Студия"}</Badge>
              </div>

              <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{p.tagline}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {p.categories.slice(0, 3).map((c) => (
              <Badge key={c}>{c}</Badge>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="text-neutral-700">
              <span className="font-semibold">{p.rating.toFixed(1)}</span>{" "}
              <span className="text-neutral-500">({p.reviews})</span>
            </div>

            <div className="text-neutral-900">
              от <span className="font-semibold">{moneyRUB(p.priceFrom)}</span>
            </div>
          </div>

          <div className="text-xs text-neutral-500">
            {p.district} · {p.address}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
