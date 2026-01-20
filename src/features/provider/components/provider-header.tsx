import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function ProviderHeader({
  name,
  tagline,
  rating,
  reviews,
  district,
  address,
  categories,
}: {
  name: string;
  tagline: string;
  rating: number;
  reviews: number;
  district: string;
  address: string;
  categories: string[];
}) {
  return (
    <Card className="overflow-hidden">
      <div className="h-40 bg-gradient-to-br from-neutral-900/10 via-neutral-900/5 to-transparent" />
      <CardContent className="-mt-10 space-y-4 p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-3xl bg-neutral-900/10" />
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-neutral-900">{name}</h1>
            <p className="mt-1 text-sm text-neutral-600">{tagline}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge>★ {rating.toFixed(1)} ({reviews})</Badge>
              <Badge>{district}</Badge>
              <Badge>{address}</Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <Badge key={c}>{c}</Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
