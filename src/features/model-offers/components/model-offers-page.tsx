"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { HeaderBlock } from "@/components/ui/header-block";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ApiResponse } from "@/lib/types/api";
import { UI_FMT } from "@/lib/ui/fmt";

type ModelOfferStatus = "ACTIVE" | "CLOSED" | "ARCHIVED";

type ModelOfferItem = {
  id: string;
  masterId: string;
  dateLocal: string;
  timeRangeStartLocal: string;
  timeRangeEndLocal: string;
  price: number | null;
  requirements: string[];
  extraBusyMin: number;
  status: ModelOfferStatus;
  createdAt: string;
  updatedAt: string;
};

type ServiceOption = {
  id: string;
  title: string;
  categoryTitle?: string | null;
  durationMin: number;
  serviceId?: string;
};

type OffersResponse = {
  offers: ModelOfferItem[];
  services: ServiceOption[];
};

type FieldErrors = {
  masterServiceId?: string;
  dateLocal?: string;
  timeRange?: string;
  price?: string;
  extraBusyMin?: string;
  requirements?: string;
};

function extractApiError<T>(json: ApiResponse<T> | null, fallback: string): string {
  if (json && !json.ok) return json.error.message || fallback;
  return fallback;
}

function toMinutes(value: string): number | null {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function extractServices(data: unknown): ServiceOption[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const listCandidate =
    (Array.isArray(root.services) ? root.services : null) ??
    (Array.isArray(root.items) ? root.items : null) ??
    (Array.isArray(root.masterServices) ? root.masterServices : null);
  if (!listCandidate) return [];

  return listCandidate.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id =
      (typeof record.id === "string" && record.id.trim()) ||
      (typeof record.masterServiceId === "string" && record.masterServiceId.trim()) ||
      null;
    const title =
      (typeof record.title === "string" && record.title.trim()) ||
      (typeof record.serviceTitle === "string" && record.serviceTitle.trim()) ||
      (typeof record.name === "string" && record.name.trim()) ||
      null;
    const duration =
      typeof record.durationMin === "number"
        ? record.durationMin
        : typeof record.duration === "number"
          ? record.duration
          : null;
    if (!id || !title || duration === null) return [];
    const categoryTitle =
      typeof record.categoryTitle === "string"
        ? record.categoryTitle
        : typeof record.category === "string"
          ? record.category
          : null;
    const serviceId = typeof record.serviceId === "string" ? record.serviceId : undefined;
    return [
      {
        id,
        title,
        categoryTitle,
        durationMin: duration,
        serviceId,
      },
    ];
  });
}

export function ModelOffersPage() {
  const [offers, setOffers] = useState<ModelOfferItem[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [masterServiceId, setMasterServiceId] = useState("");
  const [dateLocal, setDateLocal] = useState("");
  const [timeRangeStartLocal, setTimeRangeStartLocal] = useState("");
  const [timeRangeEndLocal, setTimeRangeEndLocal] = useState("");
  const [price, setPrice] = useState("");
  const [extraBusyMin, setExtraBusyMin] = useState("0");
  const [requirements, setRequirements] = useState<string[]>([]);
  const [requirementInput, setRequirementInput] = useState("");
  const [requirementsError, setRequirementsError] = useState<string | null>(null);

  const statusLabels = useMemo(
    () => ({
      ACTIVE: "Активен",
      CLOSED: "Закрыт",
      ARCHIVED: "Архив",
    }),
    []
  );

  const statusStyles = useMemo(
    () => ({
      ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
      CLOSED: "border-amber-200 bg-amber-50 text-amber-700",
      ARCHIVED: "border-slate-200 bg-slate-50 text-slate-600",
    }),
    []
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    []
  );

  const serviceOptions = useMemo(() => {
    return [...services]
      .map((service) => {
        const title = service.title.trim();
        const category = service.categoryTitle?.trim();
        const label = category ? `${title} · ${category}` : title;
        return {
          ...service,
          label,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [services]);

  const isEmptyState = useMemo(
    () => !loading && !error && offers.length === 0,
    [error, loading, offers.length]
  );

  const formatDate = useCallback(
    (value: string) => {
      const date = new Date(`${value}T00:00:00`);
      if (Number.isNaN(date.getTime())) return value;
      return dateFormatter.format(date);
    },
    [dateFormatter]
  );

  const loadOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/master/model-offers", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<OffersResponse> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(extractApiError(json, "Не удалось загрузить офферы."));
      }
      setOffers(Array.isArray(json.data.offers) ? json.data.offers : []);
      if (Array.isArray(json.data.services)) {
        setServices(json.data.services);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить офферы.");
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadServices = useCallback(async () => {
    try {
      const res = await fetch("/api/master/services", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!json || !json.ok) return;
      const options = extractServices(json.data);
      if (options.length > 0) {
        setServices(options);
      }
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    void loadOffers().then(() => loadServices());
  }, [loadOffers, loadServices]);

  const toggleCreate = useCallback(() => {
    setShowCreate((prev) => !prev);
  }, []);

  const addRequirement = useCallback(() => {
    const value = requirementInput.trim();
    if (!value) return;
    if (requirements.length >= 5) {
      setRequirementsError("Максимум 5 требований.");
      return;
    }
    const exists = requirements.some((item) => item.toLowerCase() === value.toLowerCase());
    if (!exists) {
      setRequirements((prev) => [...prev, value]);
    }
    setRequirementInput("");
    setRequirementsError(null);
  }, [requirementInput, requirements]);

  const removeRequirement = useCallback((value: string) => {
    setRequirements((prev) => prev.filter((item) => item !== value));
    setRequirementsError(null);
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (saving) return;

      setFormError(null);
      setFieldErrors({});

      const nextErrors: FieldErrors = {};
      const normalizedDate = dateLocal.trim();
      const normalizedStart = timeRangeStartLocal.trim();
      const normalizedEnd = timeRangeEndLocal.trim();

      if (!masterServiceId) nextErrors.masterServiceId = "Выберите услугу";
      if (!normalizedDate) nextErrors.dateLocal = "Укажите дату";
      if (!normalizedStart || !normalizedEnd) {
        nextErrors.timeRange = "Укажите диапазон времени";
      } else {
        const startMin = toMinutes(normalizedStart);
        const endMin = toMinutes(normalizedEnd);
        if (startMin === null || endMin === null || startMin >= endMin) {
          nextErrors.timeRange = "Время начала должно быть раньше времени окончания";
        }
      }

      let priceValue: number | null = null;
      if (price.trim() !== "") {
        const parsed = Number(price);
        if (!Number.isFinite(parsed) || parsed < 0) {
          nextErrors.price = "Укажите корректную цену";
        } else {
          priceValue = parsed;
        }
      }

      let extraBusyValue = 0;
      if (extraBusyMin.trim() !== "") {
        const parsed = Number(extraBusyMin);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 240) {
          nextErrors.extraBusyMin = "Введите значение от 0 до 240";
        } else {
          extraBusyValue = parsed;
        }
      }

      const normalizedRequirements = requirements.map((item) => item.trim()).filter(Boolean);
      if (normalizedRequirements.length > 5) {
        nextErrors.requirements = "Можно добавить не более 5 требований";
      }

      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors);
        return;
      }

      const payload: Record<string, unknown> = {
        masterServiceId,
        dateLocal: normalizedDate,
        timeRangeStartLocal: normalizedStart,
        timeRangeEndLocal: normalizedEnd,
        price: priceValue,
        extraBusyMin: extraBusyValue,
      };
      if (normalizedRequirements.length > 0) {
        payload.requirements = normalizedRequirements;
      }

      setSaving(true);
      try {
        const res = await fetch("/api/master/model-offers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ offer: ModelOfferItem }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(extractApiError(json, "Не удалось создать оффер."));
        }

        setMasterServiceId("");
        setDateLocal("");
        setTimeRangeStartLocal("");
        setTimeRangeEndLocal("");
        setPrice("");
        setExtraBusyMin("0");
        setRequirements([]);
        setRequirementInput("");
        setFieldErrors({});
        setFormError(null);
        setRequirementsError(null);

        await loadOffers();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Не удалось создать оффер.");
      } finally {
        setSaving(false);
      }
    },
    [
      dateLocal,
      extraBusyMin,
      loadOffers,
      masterServiceId,
      price,
      requirements,
      saving,
      timeRangeEndLocal,
      timeRangeStartLocal,
    ]
  );

  return (
    <section className="space-y-6">
      <HeaderBlock
        title="Ищу модель"
        subtitle="Создайте оффер, чтобы найти модель на удобное время."
        right={
          <Button variant="secondary" onClick={toggleCreate}>
            {showCreate ? "Скрыть форму" : "Создать оффер"}
          </Button>
        }
      />

      {showCreate ? (
        <Card className="border border-border-subtle bg-bg-card/90">
          <CardHeader className="space-y-1">
            <h3 className="text-lg font-semibold text-text-main">Новый оффер</h3>
            <p className="text-sm text-text-sec">
              Заполните детали, чтобы оффер появился в каталоге моделей.
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-text-sec">Услуга</label>
                  <Select
                    value={masterServiceId}
                    onChange={(event) => setMasterServiceId(event.target.value)}
                    className="mt-2"
                  >
                    <option value="">Выберите услугу</option>
                    {serviceOptions.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.label} · {service.durationMin} мин
                      </option>
                    ))}
                  </Select>
                  {fieldErrors.masterServiceId ? (
                    <p className="mt-2 text-xs text-rose-500">{fieldErrors.masterServiceId}</p>
                  ) : null}
                </div>

                <div>
                  <label className="text-sm text-text-sec">Дата</label>
                  <Input
                    type="date"
                    value={dateLocal}
                    onChange={(event) => setDateLocal(event.target.value)}
                    className="mt-2"
                  />
                  {fieldErrors.dateLocal ? (
                    <p className="mt-2 text-xs text-rose-500">{fieldErrors.dateLocal}</p>
                  ) : null}
                </div>

                <div>
                  <label className="text-sm text-text-sec">Время начала</label>
                  <Input
                    type="time"
                    value={timeRangeStartLocal}
                    onChange={(event) => setTimeRangeStartLocal(event.target.value)}
                    className="mt-2"
                  />
                </div>

                <div>
                  <label className="text-sm text-text-sec">Время окончания</label>
                  <Input
                    type="time"
                    value={timeRangeEndLocal}
                    onChange={(event) => setTimeRangeEndLocal(event.target.value)}
                    className="mt-2"
                  />
                  {fieldErrors.timeRange ? (
                    <p className="mt-2 text-xs text-rose-500">{fieldErrors.timeRange}</p>
                  ) : null}
                </div>

                <div>
                  <label className="text-sm text-text-sec">Цена</label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Бесплатно"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    className="mt-2"
                  />
                  {fieldErrors.price ? (
                    <p className="mt-2 text-xs text-rose-500">{fieldErrors.price}</p>
                  ) : null}
                </div>

                <div>
                  <label className="text-sm text-text-sec">Доп. занятость (мин.)</label>
                  <Input
                    type="number"
                    min={0}
                    max={240}
                    step={1}
                    value={extraBusyMin}
                    onChange={(event) => setExtraBusyMin(event.target.value)}
                    className="mt-2"
                  />
                  <p className="mt-2 text-xs text-text-sec">время на съемку/контент</p>
                  {fieldErrors.extraBusyMin ? (
                    <p className="mt-2 text-xs text-rose-500">{fieldErrors.extraBusyMin}</p>
                  ) : null}
                </div>
              </div>

              <div>
                <label className="text-sm text-text-sec">Требования</label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    value={requirementInput}
                    onChange={(event) => setRequirementInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addRequirement();
                      }
                    }}
                    placeholder="Например: без тату"
                    className="max-w-xs"
                  />
                  <Button type="button" variant="secondary" size="icon" onClick={addRequirement}>
                    +
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {requirements.map((item) => (
                    <Chip key={item} onClick={() => removeRequirement(item)}>
                      {item} ×
                    </Chip>
                  ))}
                </div>
                {requirementsError ? (
                  <p className="mt-2 text-xs text-rose-500">{requirementsError}</p>
                ) : null}
                {fieldErrors.requirements ? (
                  <p className="mt-2 text-xs text-rose-500">{fieldErrors.requirements}</p>
                ) : null}
              </div>

              {formError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {formError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? "Сохраняем..." : "Опубликовать оффер"}
                </Button>
                <span className="text-xs text-text-sec">После публикации оффер станет видимым в каталоге.</span>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {loading ? <div className="text-sm text-text-sec">Загружаем офферы...</div> : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          <div>{error}</div>
          <button
            type="button"
            onClick={() => void loadOffers()}
            className="mt-3 rounded-full border border-rose-300 px-4 py-2 text-sm"
          >
            Повторить
          </button>
        </div>
      ) : null}

      {isEmptyState ? (
        <div className="rounded-2xl border border-border bg-bg-card/80 p-8 text-center">
          <div className="text-base font-semibold text-text-main">Пока нет офферов</div>
          <div className="mt-2 text-sm text-text-sec">
            Создайте первый оффер, чтобы найти модель на удобное время.
          </div>
        </div>
      ) : null}

      {!loading && !error && offers.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {offers.map((offer) => {
            const statusLabel = statusLabels[offer.status] ?? offer.status;
            const statusClass = statusStyles[offer.status] ?? "";
            return (
              <Card key={offer.id} className="border border-border-subtle bg-bg-card/90">
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-text-main">
                        {formatDate(offer.dateLocal)}
                      </div>
                      <div className="text-sm text-text-sec">
                        {offer.timeRangeStartLocal} – {offer.timeRangeEndLocal}
                      </div>
                    </div>
                    <Badge className={statusClass}>{statusLabel}</Badge>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-text-main">
                    <span className="font-semibold">{(offer.price && offer.price > 0 ? UI_FMT.priceLabel(offer.price) : "Бесплатно")}</span>
                    {offer.extraBusyMin > 0 ? (
                      <span className="text-xs text-text-sec">+{offer.extraBusyMin} мин съемки</span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {offer.requirements.length > 0 ? (
                      offer.requirements.map((item) => (
                        <Chip key={item}>{item}</Chip>
                      ))
                    ) : (
                      <span className="text-xs text-text-sec">Требования не указаны</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
