"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { moneyRUB, minutesToHuman } from "@/lib/format";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import {
  fetchStudioMasters,
  fetchStudioProfile,
  type StudioMaster,
} from "@/features/booking/lib/studio-booking";

export default function StudioProfilePage() {
  const params = useParams<{ studioId: string }>();
  const studioId = params?.studioId;
  const router = useRouter();

  const [studio, setStudio] = useState<ProviderProfileDto | null>(null);
  const [masters, setMasters] = useState<StudioMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studioId) return;
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [profileRes, mastersRes] = await Promise.all([
          fetchStudioProfile(studioId),
          fetchStudioMasters(studioId),
        ]);

        if (!profileRes.ok) {
          throw new Error(profileRes.error);
        }

        if (profileRes.provider.type !== "STUDIO") {
          throw new Error("Профиль доступен только для студий");
        }

        if (!alive) return;
        setStudio(profileRes.provider);
        setMasters(mastersRes.ok ? mastersRes.masters : []);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Не удалось загрузить студию");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [studioId]);

  const subtitle = useMemo(() => {
    if (!studio) return "";
    return studio.tagline?.trim() ? studio.tagline : "Описание студии пока не заполнено.";
  }, [studio]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-text">Загружаем профиль студии…</div>
          <div className="mt-2 text-sm text-text-muted">Это может занять пару секунд.</div>
        </CardContent>
      </Card>
    );
  }

  if (error || !studio) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-text">Не удалось открыть профиль</div>
          <div className="mt-2 text-sm text-text-muted">{error ?? "Студия не найдена"}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <Section
        title={studio.name}
        subtitle={subtitle}
        right={
          <Button asChild>
            <Link href={`/studios/${studio.id}/booking`}>Перейти к записи</Link>
          </Button>
        }
      />

      <Card className="bg-surface">
        <CardContent className="p-5 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Студия</Badge>
            {studio.availableToday ? <Badge>Есть окна сегодня</Badge> : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-text-muted">
              <span className="font-semibold text-text">{studio.rating.toFixed(1)}</span>{" "}
              <span>({studio.reviews} отзывов)</span>
            </div>
            <div className="text-sm text-text">
              от <span className="font-semibold">{moneyRUB(studio.priceFrom)}</span>
            </div>
          </div>
          <div className="text-sm text-text-muted">
            {studio.district} · {studio.address}
          </div>
          <div className="flex flex-wrap gap-2">
            {studio.categories.length ? (
              studio.categories.map((c) => <Badge key={c}>{c}</Badge>)
            ) : (
              <Badge>Категории пока не заполнены</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Section title="Адрес и карта" subtitle="Адрес студии и будущая карта.">
        <Card className="bg-surface">
          <CardContent className="p-6">
            <div className="text-sm text-text">{studio.address}</div>
            <div className="mt-4 h-40 rounded-2xl border border-dashed border-border bg-muted flex items-center justify-center text-sm text-text-muted">
              Карта будет здесь
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Фото студии" subtitle="Первые фото появятся в ближайшее время.">
        <Card className="bg-surface">
          <CardContent className="p-5 md:p-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl bg-muted border border-border" />
              ))}
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Услуги студии" subtitle="Список услуг без выбора слотов.">
        {studio.services.length === 0 ? (
          <Card className="bg-surface">
            <CardContent className="p-6 text-sm text-text-muted">
              Услуги пока не добавлены.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {studio.services.map((service) => (
              <Card key={service.id} className="bg-surface">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-text">{service.name}</div>
                      <div className="mt-1 text-xs text-text-muted">
                        {minutesToHuman(service.durationMin)}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-text">
                      {service.price > 0 ? moneyRUB(service.price) : "Цена уточняется"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title="Мастера студии" subtitle="Выберите мастера и переходите к записи.">
        {masters.length === 0 ? (
          <Card className="bg-surface">
            <CardContent className="p-6 text-sm text-text-muted">
              В студии пока нет доступных мастеров.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {masters.map((master) => (
              <Card
                key={master.id}
                className="bg-surface cursor-pointer transition hover:border-text/60"
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/providers/${master.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/providers/${master.id}`);
                  }
                }}
              >
                <CardContent className="p-5 md:p-6 flex flex-wrap items-center gap-4 justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-12 w-12 rounded-2xl bg-muted border border-border" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text truncate">{master.name}</div>
                      <div className="text-xs text-text-muted">Мастер студии</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" asChild>
                      <Link
                        href={`/studios/${studio.id}/booking?masterId=${master.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Записаться
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
