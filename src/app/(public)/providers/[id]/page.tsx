"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookingWidget } from "@/features/booking/components/booking-widget";
import { moneyRUB } from "@/lib/format";

type ServiceLite = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
};

type ProviderWithServices = {
  id: string;
  type: "MASTER" | "STUDIO";
  name: string;
  tagline: string;
  rating: number;
  reviews: number;
  priceFrom: number;
  address: string;
  district: string;
  categories: string[];
  availableToday: boolean;
  services: ServiceLite[];
};

export default function ProviderProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [p, setP] = useState<ProviderWithServices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/providers/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const data = (await res.json()) as ProviderWithServices;
        if (alive) setP(data);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-neutral-900">Загрузка профиля…</div>
          <div className="mt-2 text-sm text-neutral-600">Тянем данные из Supabase.</div>
        </CardContent>
      </Card>
    );
  }

  if (error || !p) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-neutral-900">Не удалось открыть профиль</div>
          <div className="mt-2 text-sm text-neutral-600">{error ?? "Not found"}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Section
        title={p.name}
        subtitle={p.tagline}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{p.type === "MASTER" ? "Мастер" : "Студия"}</Badge>
            {p.availableToday ? <Badge>Есть сегодня</Badge> : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* LEFT */}
        <div className="space-y-4">
          <Card className="bg-white">
            <CardContent className="p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-neutral-700">
                  <span className="font-semibold text-neutral-900">{p.rating.toFixed(1)}</span>{" "}
                  <span className="text-neutral-500">({p.reviews} отзывов)</span>
                </div>
                <div className="text-sm text-neutral-900">
                  от <span className="font-semibold">{moneyRUB(p.priceFrom)}</span>
                </div>
              </div>

              <div className="mt-3 text-sm text-neutral-600">
                {p.district} · {p.address}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {p.categories.map((c) => (
                  <Badge key={c}>{c}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-5 md:p-6">
              <div className="text-sm font-semibold text-neutral-900">Портфолио (MVP)</div>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-2xl bg-neutral-100 border border-neutral-200" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="lg:sticky lg:top-24 h-fit">
          <BookingWidget providerId={p.id} services={p.services} />
        </div>
      </div>
    </div>
  );
}
