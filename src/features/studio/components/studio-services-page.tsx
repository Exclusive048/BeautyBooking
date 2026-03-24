"use client";

import { ChevronDown, ChevronUp, Settings2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MasterCardDrawer } from "@/features/studio/components/master-card-drawer";
import { moneyRUBPlain } from "@/lib/format";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import {
  normalizeStudioServiceDurationMin,
  normalizeStudioServicePrice,
} from "@/lib/studio/service-normalization";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type StudioServiceAssignedMaster = { masterId: string; masterName: string };

type StudioServiceView = {
  id: string;
  categoryId: string | null;
  globalCategoryId: string | null;
  globalCategory: { id: string; name: string } | null;
  title: string;
  basePrice: number;
  baseDurationMin: number;
  isActive: boolean;
  masters: StudioServiceAssignedMaster[];
};

type StudioCategoryView = { id: string; title: string; services: StudioServiceView[] };

type GlobalCategoryOption = {
  id: string;
  title: string;
  name?: string;
  icon: string | null;
  fullPath?: string;
};

type StudioMaster = { id: string; name: string; isActive: boolean; title: string; status?: "PENDING" | "ACTIVE" };

type ServicesData = { categories: StudioCategoryView[] };
type MastersData = { masters: StudioMaster[] };

type BookingQuestionDraft = { id?: string; tempId: string; text: string; required: boolean; order: number };
type BookingConfigDraft = { requiresReferencePhoto: boolean; questions: BookingQuestionDraft[] };

type Props = { studioId: string };

const UNCATEGORIZED_ID = "__uncategorized__";

function buildTempId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function categoryLabel(category: GlobalCategoryOption): string {
  const title = category.fullPath || category.title || category.name || "";
  return `${category.icon ? `${category.icon} ` : ""}${title}`;
}

export function StudioServicesPage({ studioId }: Props) {
  const t = UI_TEXT.studioCabinet.services;
  const bookingText = UI_TEXT.master.profile.bookingConfig;
  const statusText = UI_TEXT.status;

  const [data, setData] = useState<ServicesData>({ categories: [] });
  const [masters, setMasters] = useState<StudioMaster[]>([]);
  const [globalCategories, setGlobalCategories] = useState<GlobalCategoryOption[]>([]);
  const [serviceGlobalCategoryById, setServiceGlobalCategoryById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showProposeCategoryModal, setShowProposeCategoryModal] = useState(false);
  const [submittingCategory, setSubmittingCategory] = useState(false);
  const [submittingService, setSubmittingService] = useState(false);
  const [proposingCategory, setProposingCategory] = useState(false);
  const [newCategoryTitle, setNewCategoryTitle] = useState("");
  const [newServiceTitle, setNewServiceTitle] = useState("");
  const [newServiceCategoryId, setNewServiceCategoryId] = useState("");
  const [newServiceGlobalCategoryId, setNewServiceGlobalCategoryId] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState("");
  const [newServiceMasterIds, setNewServiceMasterIds] = useState<string[]>([]);
  const [proposedCategoryTitle, setProposedCategoryTitle] = useState("");
  const [proposeCategoryMessage, setProposeCategoryMessage] = useState<string | null>(null);

  const [expandedAssignmentsServiceId, setExpandedAssignmentsServiceId] = useState<string | null>(null);
  const [assigningKey, setAssigningKey] = useState<string | null>(null);
  const [togglingServiceId, setTogglingServiceId] = useState<string | null>(null);
  const [savingServiceCategoryId, setSavingServiceCategoryId] = useState<string | null>(null);
  const [drawerMasterId, setDrawerMasterId] = useState<string | null>(null);

  const [bookingConfigService, setBookingConfigService] = useState<{ id: string; title: string } | null>(null);
  const [bookingConfigDraft, setBookingConfigDraft] = useState<BookingConfigDraft | null>(null);
  const [bookingConfigLoading, setBookingConfigLoading] = useState(false);
  const [bookingConfigSaving, setBookingConfigSaving] = useState(false);
  const [bookingConfigError, setBookingConfigError] = useState<string | null>(null);

  const editableCategories = useMemo(
    () => data.categories.filter((category) => category.id !== UNCATEGORIZED_ID),
    [data.categories]
  );
  const services = useMemo(() => data.categories.flatMap((category) => category.services), [data.categories]);
  const totalServices = services.length;
  const totalAssignments = useMemo(
    () => services.reduce((sum, service) => sum + service.masters.length, 0),
    [services]
  );
  const servicesWithoutMasters = useMemo(
    () => services.filter((service) => service.masters.length === 0).length,
    [services]
  );
  const mastersMap = useMemo(() => new Map(masters.map((master) => [master.id, master])), [masters]);

  const summaryText = useMemo(() => {
    return t.summary
      .replace("{categories}", String(editableCategories.length))
      .replace("{services}", String(totalServices));
  }, [editableCategories.length, t.summary, totalServices]);

  const patchService = useCallback(
    (serviceId: string, updater: (service: StudioServiceView) => StudioServiceView) => {
      setData((current) => ({
        categories: current.categories.map((category) => ({
          ...category,
          services: category.services.map((service) => (service.id === serviceId ? updater(service) : service)),
        })),
      }));
    },
    []
  );

  const assignMaster = useCallback(
    async (serviceId: string, masterId: string, isEnabled: boolean): Promise<void> => {
      const res = await fetchWithAuth(`/api/studio/services/${serviceId}/assign-master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioId, masterId, isEnabled }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ serviceId: string; masterId: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }
    },
    [studioId, t.apiErrorPrefix]
  );

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ studioId });
      const [servicesRes, mastersRes, categoriesRes] = await Promise.all([
        fetchWithAuth(`/api/studio/services?${params.toString()}`, { cache: "no-store" }),
        fetchWithAuth(`/api/studio/masters?${params.toString()}`, { cache: "no-store" }),
        fetchWithAuth("/api/catalog/global-categories?status=APPROVED", { cache: "no-store" }),
      ]);
      const servicesJson = (await servicesRes.json().catch(() => null)) as ApiResponse<ServicesData> | null;
      if (!servicesRes.ok || !servicesJson || !servicesJson.ok) {
        throw new Error(
          servicesJson && !servicesJson.ok
            ? servicesJson.error.message
            : `${t.apiErrorPrefix}: ${servicesRes.status}`
        );
      }
      setData(servicesJson.data);
      const nextServiceCategoryById: Record<string, string> = {};
      for (const category of servicesJson.data.categories) {
        for (const service of category.services) {
          nextServiceCategoryById[service.id] = service.globalCategoryId ?? "";
        }
      }
      setServiceGlobalCategoryById(nextServiceCategoryById);

      const categories = servicesJson.data.categories.filter((category) => category.id !== UNCATEGORIZED_ID);
      setNewServiceCategoryId((current) => {
        if (categories.length === 0) return "";
        if (categories.some((item) => item.id === current)) return current;
        return categories[0].id;
      });

      const mastersJson = (await mastersRes.json().catch(() => null)) as ApiResponse<MastersData> | null;
      setMasters(mastersRes.ok && mastersJson && mastersJson.ok ? mastersJson.data.masters : []);

      const categoriesJson = (await categoriesRes.json().catch(() => null)) as
        | ApiResponse<{ categories: GlobalCategoryOption[] } | GlobalCategoryOption[]>
        | null;
      if (categoriesRes.ok && categoriesJson && categoriesJson.ok) {
        const items = Array.isArray(categoriesJson.data) ? categoriesJson.data : categoriesJson.data.categories;
        setGlobalCategories(items.map((item) => ({ ...item, title: item.title || item.name || "" })));
      } else {
        setGlobalCategories([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [studioId, t.apiErrorPrefix, t.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!bookingConfigService) {
      setBookingConfigDraft(null);
      setBookingConfigError(null);
      return;
    }
    let cancelled = false;
    setBookingConfigLoading(true);
    setBookingConfigError(null);
    const params = new URLSearchParams({ studioId });
    void (async () => {
      try {
        const res = await fetchWithAuth(
          `/api/studio/services/${bookingConfigService.id}/booking-config?${params.toString()}`,
          { cache: "no-store" }
        );
        const json = (await res.json().catch(() => null)) as ApiResponse<{
          requiresReferencePhoto: boolean;
          questions: Array<{ id: string; text: string; required: boolean; order: number }>;
        }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
        }
        if (!cancelled) {
          setBookingConfigDraft({
            requiresReferencePhoto: json.data.requiresReferencePhoto,
            questions: (json.data.questions ?? []).map((question, index) => ({
              id: question.id,
              tempId: question.id || buildTempId("question"),
              text: question.text,
              required: question.required,
              order: Number.isFinite(question.order) ? question.order : index,
            })),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setBookingConfigDraft(null);
          setBookingConfigError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.loadBookingConfig);
        }
      } finally {
        if (!cancelled) setBookingConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingConfigService, studioId, t.apiErrorPrefix]);

  const toggleServiceActive = async (service: StudioServiceView, nextValue: boolean): Promise<void> => {
    setTogglingServiceId(service.id);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/studio/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioId, isActive: nextValue }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }
      patchService(service.id, (current) => ({ ...current, isActive: nextValue }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setTogglingServiceId(null);
    }
  };

  const saveServiceGlobalCategory = async (service: StudioServiceView): Promise<void> => {
    const nextGlobalCategoryId = (serviceGlobalCategoryById[service.id] ?? "").trim();
    setSavingServiceCategoryId(service.id);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/studio/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioId, globalCategoryId: nextGlobalCategoryId || null }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }
      const globalCategory = nextGlobalCategoryId
        ? globalCategories.find((item) => item.id === nextGlobalCategoryId)
        : null;
      patchService(service.id, (current) => ({
        ...current,
        globalCategoryId: nextGlobalCategoryId || null,
        globalCategory: globalCategory
          ? { id: globalCategory.id, name: globalCategory.title || globalCategory.name || "" }
          : null,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить категорию услуги");
    } finally {
      setSavingServiceCategoryId(null);
    }
  };

  const toggleMasterAssignment = async (
    service: StudioServiceView,
    masterId: string,
    nextEnabled: boolean
  ): Promise<void> => {
    const key = `${service.id}:${masterId}`;
    setAssigningKey(key);
    setError(null);
    try {
      await assignMaster(service.id, masterId, nextEnabled);
      patchService(service.id, (current) => {
        const exists = current.masters.some((item) => item.masterId === masterId);
        if (nextEnabled && !exists) {
          const masterName = mastersMap.get(masterId)?.name || "Мастер";
          return { ...current, masters: [...current.masters, { masterId, masterName }] };
        }
        if (!nextEnabled && exists) {
          return { ...current, masters: current.masters.filter((item) => item.masterId !== masterId) };
        }
        return current;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.assignFailed);
    } finally {
      setAssigningKey(null);
    }
  };

  const submitCategory = async (): Promise<void> => {
    if (!newCategoryTitle.trim()) return;
    setSubmittingCategory(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/studio/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioId, title: newCategoryTitle.trim() }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }
      setShowCategoryModal(false);
      setNewCategoryTitle("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.createCategoryFailed);
    } finally {
      setSubmittingCategory(false);
    }
  };

  const submitService = async (): Promise<void> => {
    if (!newServiceTitle.trim() || !newServiceCategoryId) return;
    const normalizedPrice = normalizeStudioServicePrice(Number(newServicePrice.trim() === "" ? "0" : newServicePrice));
    const normalizedDuration = normalizeStudioServiceDurationMin(
      Number(newServiceDuration.trim() === "" ? "60" : newServiceDuration)
    );
    const selectedMasterIds = [...newServiceMasterIds];
    setSubmittingService(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/studio/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioId,
          categoryId: newServiceCategoryId,
          title: newServiceTitle.trim(),
          globalCategoryId: newServiceGlobalCategoryId || undefined,
          basePrice: normalizedPrice,
          baseDurationMin: normalizedDuration,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }
      if (selectedMasterIds.length > 0) {
        const results = await Promise.allSettled(
          selectedMasterIds.map((masterId) => assignMaster(json.data.id, masterId, true))
        );
        const failed = results.filter((item) => item.status === "rejected").length;
        if (failed > 0) {
          setError(
            `Услуга создана, но назначения мастеров сохранились частично (${failed}/${selectedMasterIds.length}).`
          );
        }
      }
      setShowServiceModal(false);
      setNewServiceTitle("");
      setNewServiceGlobalCategoryId("");
      setNewServicePrice("");
      setNewServiceDuration("");
      setNewServiceMasterIds([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.createServiceFailed);
    } finally {
      setSubmittingService(false);
    }
  };

  const submitCategoryProposal = async (): Promise<void> => {
    const title = proposedCategoryTitle.trim();
    if (!title) return;
    setProposingCategory(true);
    setError(null);
    setProposeCategoryMessage(null);
    try {
      const res = await fetchWithAuth("/api/categories/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: title, context: "SERVICE", isPersonalOnly: true }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }
      setShowProposeCategoryModal(false);
      setProposedCategoryTitle("");
      setProposeCategoryMessage("Категория отправлена на модерацию. Услугу можно сохранить и без категории.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить категорию на модерацию");
    } finally {
      setProposingCategory(false);
    }
  };

  const addBookingQuestion = () => {
    setBookingConfigDraft((current) => {
      if (!current || current.questions.length >= 5) return current;
      return {
        ...current,
        questions: [...current.questions, { tempId: buildTempId("question"), text: "", required: false, order: current.questions.length }],
      };
    });
  };

  const updateBookingQuestion = (tempId: string, patch: Partial<BookingQuestionDraft>) => {
    setBookingConfigDraft((current) =>
      current
        ? {
            ...current,
            questions: current.questions.map((question) => (question.tempId === tempId ? { ...question, ...patch } : question)),
          }
        : current
    );
  };

  const removeBookingQuestion = (tempId: string) => {
    setBookingConfigDraft((current) =>
      current ? { ...current, questions: current.questions.filter((question) => question.tempId !== tempId) } : current
    );
  };

  const moveBookingQuestion = (index: number, direction: -1 | 1) => {
    setBookingConfigDraft((current) => {
      if (!current) return current;
      const next = [...current.questions];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, questions: next.map((question, idx) => ({ ...question, order: idx })) };
    });
  };

  const closeBookingConfig = () => {
    setBookingConfigService(null);
    setBookingConfigDraft(null);
    setBookingConfigError(null);
  };

  const saveBookingConfig = async (): Promise<void> => {
    if (!bookingConfigService || !bookingConfigDraft) return;
    setBookingConfigSaving(true);
    setBookingConfigError(null);
    try {
      const params = new URLSearchParams({ studioId });
      const res = await fetchWithAuth(
        `/api/studio/services/${bookingConfigService.id}/booking-config?${params.toString()}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requiresReferencePhoto: bookingConfigDraft.requiresReferencePhoto,
            questions: bookingConfigDraft.questions.map((question, order) => ({
              id: question.id,
              text: question.text,
              required: question.required,
              order,
            })),
          }),
        }
      );
      const json = (await res.json().catch(() => null)) as ApiResponse<{
        requiresReferencePhoto: boolean;
        questions: Array<{ id: string; text: string; required: boolean; order: number }>;
      }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }
      closeBookingConfig();
    } catch (err) {
      setBookingConfigError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.loadBookingConfig);
    } finally {
      setBookingConfigSaving(false);
    }
  };

  if (loading) return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>;

  return (
    <div className="space-y-4">
      <section className="lux-card rounded-[24px] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-text-main">{UI_TEXT.master.profile.sections.servicesTitle}</h3>
            <p className="mt-1 text-sm text-text-sec">{summaryText}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setShowServiceModal(true)} variant="secondary" size="sm" disabled={editableCategories.length === 0}>+ {t.addService}</Button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl bg-bg-input/70 p-3 text-sm"><div className="text-text-sec">Назначения</div><div className="mt-1 font-semibold text-text-main">{totalAssignments}</div></div>
          <div className="rounded-2xl bg-bg-input/70 p-3 text-sm"><div className="text-text-sec">Услуги без мастера</div><div className="mt-1 font-semibold text-text-main">{servicesWithoutMasters}</div></div>
          <div className="rounded-2xl bg-bg-input/70 p-3 text-sm"><div className="text-text-sec">Мастера студии</div><div className="mt-1 font-semibold text-text-main">{masters.length}</div></div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {totalServices === 0 ? (
        <section className="lux-card rounded-[24px] p-6 text-center">
          <h3 className="text-base font-semibold text-text-main">{t.noServicesTitle}</h3>
          <p className="mt-1 text-sm text-text-sec">{t.noServicesDescription}</p>
        </section>
      ) : null}

      {data.categories.map((category) => (
        <section key={category.id} className="lux-card overflow-hidden rounded-[24px]">
          <header className="flex items-center justify-between border-b border-border-subtle/80 px-5 py-4">
            <h2 className="text-sm font-semibold text-text-main">{category.title}</h2>
            <span className="text-xs text-text-sec">{category.services.length}</span>
          </header>
          <div className="space-y-3 p-3">
            {category.services.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-subtle bg-bg-input/40 p-4 text-sm text-text-sec">
                В этой категории пока нет услуг.
              </div>
            ) : null}

            {category.services.map((service) => {
              const assignedMasters = [...service.masters].sort((a, b) =>
                a.masterName.localeCompare(b.masterName, "ru")
              );
              const expanded = expandedAssignmentsServiceId === service.id;
              const assignmentSummary =
                assignedMasters.length === 0
                  ? "Не назначено ни одному мастеру"
                  : assignedMasters.length === 1
                    ? "Назначено 1 мастеру"
                    : `Назначено ${assignedMasters.length} мастерам`;

              return (
                <article key={service.id} className="rounded-2xl border border-border-subtle bg-bg-input/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-text-main">{service.title}</h3>
                        {service.globalCategory ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                            {service.globalCategory.name}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">
                            Без категории
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-sec">
                        <span className="rounded-full bg-bg-elevated px-2 py-1 text-text-main">
                          {service.baseDurationMin} {t.durationMin}
                        </span>
                        <span className="rounded-full bg-bg-elevated px-2 py-1 text-text-main">
                          {moneyRUBPlain(service.basePrice)} {t.currency}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-text-main">
                        <Users className="h-4 w-4 text-text-sec" />
                        {assignmentSummary}
                      </div>

                      {assignedMasters.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {assignedMasters.map((master) => (
                            <Chip
                              key={`${service.id}-${master.masterId}`}
                              type="button"
                              onClick={() => setDrawerMasterId(master.masterId)}
                            >
                              {master.masterName}
                            </Chip>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Select
                          className="min-w-[220px] rounded-xl px-2 py-1 text-sm"
                          value={serviceGlobalCategoryById[service.id] ?? service.globalCategoryId ?? ""}
                          onChange={(event) =>
                            setServiceGlobalCategoryById((current) => ({
                              ...current,
                              [service.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Без категории</option>
                          {globalCategories.map((item) => (
                            <option key={`service-global-category-${service.id}-${item.id}`} value={item.id}>
                              {categoryLabel(item)}
                            </option>
                          ))}
                        </Select>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void saveServiceGlobalCategory(service)}
                          disabled={savingServiceCategoryId === service.id}
                        >
                          {savingServiceCategoryId === service.id ? "Сохраняем..." : "Сохранить категорию"}
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <label className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-card px-3 py-2 text-xs text-text-sec">
                        <span>{service.isActive ? "Вкл" : "Выкл"}</span>
                        <Switch
                          checked={service.isActive}
                          onCheckedChange={(next) => void toggleServiceActive(service, next)}
                          disabled={togglingServiceId === service.id}
                          size="sm"
                        />
                      </label>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setBookingConfigService({ id: service.id, title: service.title })}
                        className="gap-1"
                      >
                        <Settings2 className="h-4 w-4" />
                        {bookingText.open}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpandedAssignmentsServiceId((current) => (current === service.id ? null : service.id))
                        }
                        className="gap-1"
                      >
                        {expanded ? (
                          <>
                            <ChevronUp className="h-4 w-4" />
                            Скрыть назначения
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4" />
                            Назначить мастеров
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="mt-4 rounded-2xl border border-border-subtle bg-bg-card/70 p-3">
                      <div className="mb-3 text-xs text-text-sec">
                        Выберите мастеров, которые могут выполнять эту услугу.
                      </div>
                      {masters.length === 0 ? (
                        <div className="rounded-xl bg-bg-input p-3 text-sm text-text-sec">
                          В студии пока нет мастеров.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {masters.map((master) => {
                            const checked = service.masters.some((item) => item.masterId === master.id);
                            const key = `${service.id}:${master.id}`;
                            return (
                              <label
                                key={`${service.id}-${master.id}`}
                                className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-input/70 px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-sm text-text-main">
                                    {master.name}
                                    {master.status === "PENDING" ? " (приглашён)" : ""}
                                  </div>
                                  <div className="text-xs text-text-sec">{master.title}</div>
                                </div>
                                <Switch
                                  size="sm"
                                  checked={checked}
                                  disabled={assigningKey === key}
                                  onCheckedChange={(next) => void toggleMasterAssignment(service, master.id, next)}
                                />
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <ModalSurface open={showCategoryModal} onClose={() => setShowCategoryModal(false)}>
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-text-main">{t.createCategoryTitle}</h3>
          <Input
            type="text"
            value={newCategoryTitle}
            onChange={(event) => setNewCategoryTitle(event.target.value)}
            placeholder={t.categoryTitlePlaceholder}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setShowCategoryModal(false)} variant="secondary">
              {t.cancel}
            </Button>
            <Button type="button" onClick={() => void submitCategory()} disabled={submittingCategory}>
              {submittingCategory ? t.creating : t.save}
            </Button>
          </div>
        </div>
      </ModalSurface>

      <ModalSurface open={showServiceModal} onClose={() => setShowServiceModal(false)}>
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-text-main">{t.createServiceTitle}</h3>
          <div className="space-y-2">
            <Select value={newServiceCategoryId} onChange={(event) => setNewServiceCategoryId(event.target.value)}>
              <option value="">{t.selectCategory}</option>
              {editableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.title}
                </option>
              ))}
            </Select>
            <Select
              value={newServiceGlobalCategoryId}
              onChange={(event) => setNewServiceGlobalCategoryId(event.target.value)}
            >
              <option value="">Глобальная категория</option>
              {globalCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {categoryLabel(item)}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => setShowProposeCategoryModal(true)}
              className="w-fit text-xs font-medium text-primary underline"
            >
              + Предложить свою категорию
            </button>
            {proposeCategoryMessage ? <div className="text-xs text-emerald-500">{proposeCategoryMessage}</div> : null}
            <Input
              type="text"
              value={newServiceTitle}
              onChange={(event) => setNewServiceTitle(event.target.value)}
              placeholder={t.serviceTitlePlaceholder}
            />
            <Input
              type="number"
              min={0}
              step={100}
              value={newServicePrice}
              onChange={(event) => setNewServicePrice(event.target.value)}
              placeholder={t.pricePlaceholder}
            />
            <Input
              type="number"
              min={5}
              step={5}
              value={newServiceDuration}
              onChange={(event) => setNewServiceDuration(event.target.value)}
              placeholder={t.durationPlaceholder}
            />
          </div>

          <div className="rounded-2xl border border-border-subtle bg-bg-input/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-text-main">Назначить мастеров сразу</div>
              <div className="text-xs text-text-sec">{newServiceMasterIds.length}</div>
            </div>
            {masters.length === 0 ? (
              <p className="mt-2 text-xs text-text-sec">Сначала добавьте мастеров студии.</p>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setNewServiceMasterIds(masters.map((master) => master.id))}
                  >
                    Выбрать всех
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setNewServiceMasterIds([])}>
                    Очистить
                  </Button>
                </div>
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                  {masters.map((master) => {
                    const checked = newServiceMasterIds.includes(master.id);
                    return (
                      <label
                        key={`new-service-master-${master.id}`}
                        className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-card px-3 py-2"
                      >
                        <span className="text-sm text-text-main">{master.name}</span>
                        <Switch
                          size="sm"
                          checked={checked}
                          onCheckedChange={(next) =>
                            setNewServiceMasterIds((current) =>
                              next ? [...current, master.id] : current.filter((id) => id !== master.id)
                            )
                          }
                        />
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setShowServiceModal(false)} variant="secondary">
              {t.cancel}
            </Button>
            <Button type="button" onClick={() => void submitService()} disabled={submittingService}>
              {submittingService ? t.creating : t.save}
            </Button>
          </div>
        </div>
      </ModalSurface>

      <ModalSurface
        open={showProposeCategoryModal}
        onClose={() => {
          if (!proposingCategory) {
            setShowProposeCategoryModal(false);
            setProposedCategoryTitle("");
          }
        }}
      >
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-text-main">Предложить категорию</h3>
          <Input
            type="text"
            value={proposedCategoryTitle}
            onChange={(event) => setProposedCategoryTitle(event.target.value)}
            placeholder={t.categoryTitlePlaceholder}
            maxLength={60}
          />
          <div className="text-xs text-text-sec">
            Категория будет отправлена на модерацию. Услугу можно сохранить и без категории.
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              onClick={() => {
                setShowProposeCategoryModal(false);
                setProposedCategoryTitle("");
              }}
              variant="secondary"
              disabled={proposingCategory}
            >
              {t.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => void submitCategoryProposal()}
              disabled={proposingCategory || !proposedCategoryTitle.trim()}
            >
              {proposingCategory ? t.creating : "Отправить"}
            </Button>
          </div>
        </div>
      </ModalSurface>

      {bookingConfigService ? (
        <ModalSurface open onClose={closeBookingConfig} title={`${bookingText.title}: ${bookingConfigService.title}`}>
          <div className="space-y-4">
            {bookingConfigLoading ? <div className="text-sm text-text-sec">{bookingText.loading}</div> : null}
            {bookingConfigError ? <div className="text-sm text-rose-400">{bookingConfigError}</div> : null}
            {bookingConfigDraft ? (
              <>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-input/60 p-3">
                  <span className="text-sm text-text-main">{bookingText.referencePhotoRequiredLabel}</span>
                  <Switch
                    checked={bookingConfigDraft.requiresReferencePhoto}
                    onCheckedChange={(next) =>
                      setBookingConfigDraft((current) =>
                        current ? { ...current, requiresReferencePhoto: next } : current
                      )
                    }
                    size="sm"
                  />
                </label>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-text-main">{bookingText.questionsTitle}</div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={addBookingQuestion}
                      disabled={bookingConfigDraft.questions.length >= 5}
                    >
                      + {bookingText.addQuestion}
                    </Button>
                  </div>

                  {bookingConfigDraft.questions.length === 0 ? (
                    <div className="text-xs text-text-sec">{bookingText.empty}</div>
                  ) : null}

                  {bookingConfigDraft.questions.map((question, index) => (
                    <div key={question.tempId} className="rounded-xl border border-border-subtle bg-bg-input/70 p-3">
                      <div className="text-xs font-medium text-text-sec">
                        {bookingText.questionLabel} {index + 1}
                      </div>
                      <Input
                        type="text"
                        value={question.text}
                        onChange={(event) => updateBookingQuestion(question.tempId, { text: event.target.value })}
                        placeholder={bookingText.questionPlaceholder}
                        className="mt-2"
                      />
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={index === 0}
                            onClick={() => moveBookingQuestion(index, -1)}
                          >
                            {bookingText.moveUp}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={index === bookingConfigDraft.questions.length - 1}
                            onClick={() => moveBookingQuestion(index, 1)}
                          >
                            {bookingText.moveDown}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeBookingQuestion(question.tempId)}
                          >
                            {bookingText.remove}
                          </Button>
                        </div>
                        <label className="inline-flex items-center gap-2 text-xs text-text-sec">
                          <Switch
                            size="sm"
                            checked={question.required}
                            onCheckedChange={(next) => updateBookingQuestion(question.tempId, { required: next })}
                          />
                          {bookingText.required}
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeBookingConfig}>
                {t.cancel}
              </Button>
              <Button
                type="button"
                onClick={() => void saveBookingConfig()}
                disabled={bookingConfigSaving || bookingConfigLoading || !bookingConfigDraft}
              >
                {bookingConfigSaving ? statusText.saving : statusText.saved}
              </Button>
            </div>
          </div>
        </ModalSurface>
      ) : null}

      {drawerMasterId ? (
        <MasterCardDrawer
          studioId={studioId}
          masterId={drawerMasterId}
          onClose={() => setDrawerMasterId(null)}
          onSaved={() => {
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
