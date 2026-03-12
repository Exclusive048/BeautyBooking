"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { moneyRUBPlain } from "@/lib/format";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { TooltipHint } from "@/components/ui/tooltip-hint";
import { MasterCardDrawer } from "@/features/studio/components/master-card-drawer";
import { usePlanFeatures } from "@/lib/billing/use-plan-features";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import {
  normalizeStudioServiceDurationMin,
  normalizeStudioServicePrice,
} from "@/lib/studio/service-normalization";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type StudioServiceAssignedMaster = {
  masterId: string;
  masterName: string;
};

type StudioServiceView = {
  id: string;
  globalCategoryId: string | null;
  globalCategory: { id: string; name: string } | null;
  title: string;
  basePrice: number;
  baseDurationMin: number;
  isActive: boolean;
  onlinePaymentEnabled: boolean;
  masters: StudioServiceAssignedMaster[];
};

type StudioCategoryView = {
  id: string;
  title: string;
  services: StudioServiceView[];
};

type GlobalCategoryOption = {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  parentId?: string | null;
  depth?: number;
  fullPath?: string;
};

type ServicesData = {
  categories: StudioCategoryView[];
};

type StudioMaster = {
  id: string;
  name: string;
  isActive: boolean;
  title: string;
};

type MastersData = {
  masters: StudioMaster[];
};

type Props = {
  studioId: string;
};

export function StudioServicesPage({ studioId }: Props) {
  const t = UI_TEXT.studioCabinet.services;
  const plan = usePlanFeatures("STUDIO");
  const [data, setData] = useState<ServicesData>({ categories: [] });
  const [masters, setMasters] = useState<StudioMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigningServiceId, setAssigningServiceId] = useState<string | null>(null);
  const [selectedMasterByService, setSelectedMasterByService] = useState<Record<string, string>>({});
  const [drawerMasterId, setDrawerMasterId] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [submittingCategory, setSubmittingCategory] = useState(false);
  const [submittingService, setSubmittingService] = useState(false);
  const [togglingServiceId, setTogglingServiceId] = useState<string | null>(null);
  const [newCategoryTitle, setNewCategoryTitle] = useState("");
  const [newServiceTitle, setNewServiceTitle] = useState("");
  const [newServiceCategoryId, setNewServiceCategoryId] = useState("");
  const [newServiceGlobalCategoryId, setNewServiceGlobalCategoryId] = useState("");
  const [serviceGlobalCategoryById, setServiceGlobalCategoryById] = useState<Record<string, string>>({});
  const [savingServiceCategoryId, setSavingServiceCategoryId] = useState<string | null>(null);
  const [showProposeCategoryModal, setShowProposeCategoryModal] = useState(false);
  const [proposedCategoryTitle, setProposedCategoryTitle] = useState("");
  const [proposingCategory, setProposingCategory] = useState(false);
  const [proposeCategoryMessage, setProposeCategoryMessage] = useState<string | null>(null);
  const [newServicePrice, setNewServicePrice] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState("");
  const [globalCategories, setGlobalCategories] = useState<GlobalCategoryOption[]>([]);

  const totalServices = useMemo(
    () => data.categories.reduce((sum, category) => sum + category.services.length, 0),
    [data.categories]
  );

  const summaryText = useMemo(() => {
    return t.summary
      .replace("{categories}", String(data.categories.length))
      .replace("{services}", String(totalServices));
  }, [data.categories.length, t.summary, totalServices]);
  const onlinePaymentsAllowed = plan.can("onlinePayments");
  const onlinePaymentsSystemEnabled = plan.system?.onlinePaymentsEnabled ?? false;
  const canOnlinePayments = onlinePaymentsAllowed && onlinePaymentsSystemEnabled;
  const onlinePaymentsLockedMessage = !onlinePaymentsAllowed
    ? "Онлайн-оплата доступна на PRO и выше."
    : !onlinePaymentsSystemEnabled
      ? "Функция временно отключена администрацией"
      : null;

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const servicesParams = new URLSearchParams({ studioId });
      const servicesRes = await fetchWithAuth(`/api/studio/services?${servicesParams.toString()}`, {
        cache: "no-store",
      });
      const servicesJson = (await servicesRes.json().catch(() => null)) as ApiResponse<ServicesData> | null;
      if (!servicesRes.ok || !servicesJson || !servicesJson.ok) {
        throw new Error(
          servicesJson && !servicesJson.ok
            ? servicesJson.error.message
            : `${t.apiErrorPrefix}: ${servicesRes.status}`
        );
      }
      setData(servicesJson.data);
      const nextServiceCategories: Record<string, string> = {};
      for (const category of servicesJson.data.categories) {
        for (const service of category.services) {
          nextServiceCategories[service.id] = service.globalCategoryId ?? "";
        }
      }
      setServiceGlobalCategoryById(nextServiceCategories);
      if (!newServiceCategoryId && servicesJson.data.categories.length > 0) {
        setNewServiceCategoryId(servicesJson.data.categories[0].id);
      }

      const [mastersRes, categoriesRes] = await Promise.all([
        fetchWithAuth(`/api/studio/masters?${servicesParams.toString()}`, { cache: "no-store" }),
        fetchWithAuth("/api/catalog/global-categories?status=APPROVED", { cache: "no-store" }),
      ]);
      const mastersJson = (await mastersRes.json().catch(() => null)) as ApiResponse<MastersData> | null;
      if (mastersRes.ok && mastersJson && mastersJson.ok) {
        setMasters(mastersJson.data.masters);
      } else {
        setMasters([]);
      }
      const categoriesJson = (await categoriesRes.json().catch(() => null)) as
        | ApiResponse<{ categories: GlobalCategoryOption[] } | GlobalCategoryOption[]>
        | null;
      if (categoriesRes.ok && categoriesJson && categoriesJson.ok) {
        setGlobalCategories(
          Array.isArray(categoriesJson.data) ? categoriesJson.data : categoriesJson.data.categories
        );
      } else {
        setGlobalCategories([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId, t.apiErrorPrefix, t.loadFailed]);

  const assignMaster = async (serviceId: string): Promise<void> => {
    const masterId = selectedMasterByService[serviceId];
    if (!masterId) return;
    setAssigningServiceId(serviceId);
    try {
      const res = await fetchWithAuth(`/api/studio/services/${serviceId}/assign-master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioId, masterId }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ serviceId: string; masterId: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.assignFailed);
    } finally {
      setAssigningServiceId(null);
    }
  };

  const toggleOnlinePayment = async (service: StudioServiceView, nextValue: boolean): Promise<void> => {
    if (nextValue && !canOnlinePayments) {
      setError(onlinePaymentsLockedMessage ?? "Онлайн-оплата недоступна.");
      return;
    }
    setTogglingServiceId(service.id);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/studio/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioId,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setTogglingServiceId(null);
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
        body: JSON.stringify({
          studioId,
          title: newCategoryTitle.trim(),
        }),
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
    const normalizedPrice = normalizeStudioServicePrice(
      Number(newServicePrice.trim() === "" ? "0" : newServicePrice)
    );
    const normalizedDuration = normalizeStudioServiceDurationMin(
      Number(newServiceDuration.trim() === "" ? "60" : newServiceDuration)
    );
    setNewServicePrice(String(normalizedPrice));
    setNewServiceDuration(String(normalizedDuration));

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
      setShowServiceModal(false);
      setNewServiceTitle("");
      setNewServiceGlobalCategoryId("");
      setNewServicePrice("");
      setNewServiceDuration("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.createServiceFailed);
    } finally {
      setSubmittingService(false);
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
        body: JSON.stringify({
          studioId,
          globalCategoryId: nextGlobalCategoryId || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить категорию услуги");
    } finally {
      setSavingServiceCategoryId(null);
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
      setProposeCategoryMessage(
        "Категория отправлена на модерацию. Пока можете сохранить услугу без категории."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить категорию на модерацию");
    } finally {
      setProposingCategory(false);
    }
  };

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="lux-card rounded-[24px] p-4 text-sm text-text-sec">{summaryText}</div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setShowCategoryModal(true)} variant="secondary" size="sm">
          + {t.createCategory}
        </Button>
        <Button
          type="button"
          onClick={() => setShowServiceModal(true)}
          variant="secondary"
          size="sm"
          disabled={data.categories.length === 0}
        >
          + {t.addService}
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {totalServices === 0 ? (
        <section className="lux-card rounded-[24px] p-5">
          <h3 className="text-base font-semibold text-text-main">{t.noServicesTitle}</h3>
          <p className="mt-1 text-sm text-text-sec">{t.noServicesDescription}</p>
        </section>
      ) : null}

      {data.categories.map((category) => (
        <section key={category.id} className="lux-card overflow-hidden rounded-[24px]">
          <header className="border-b border-border-subtle/80 px-5 py-4">
            <h2 className="text-sm font-semibold text-text-main">{category.title}</h2>
          </header>
          <div className="space-y-2 p-3">
            {category.services.map((service) => (
              <div key={service.id} className="rounded-2xl border border-border-subtle bg-bg-input/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-text-main">{service.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-text-sec">
                      <span>{service.baseDurationMin} {t.durationMin}</span>
                      <span>•</span>
                      <span>{`${moneyRUBPlain(service.basePrice)} ${t.currency}`}</span>
                    </div>
                    <label className="mt-2 inline-flex items-center gap-2 text-xs text-text-sec">
                      <input
                        type="checkbox"
                        checked={service.isActive}
                        readOnly
                        className="h-4 w-4 rounded border-border-subtle accent-primary"
                      />
                      <span>{t.visibleInSearch}</span>
                      <TooltipHint text={t.visibleInSearchHint} />
                    </label>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {service.globalCategory ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                          {service.globalCategory.name}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">
                          Нет категории
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
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
                        {globalCategories.map((category) => (
                          <option key={`service-global-category-${service.id}-${category.id}`} value={category.id}>
                            {category.icon ? `${category.icon} ` : ""}
                            {category.fullPath || category.title}
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
                    {false && (
                      <>
                        {/* TODO: Online payments for services - not yet implemented */}
                        <label className="mt-2 inline-flex items-center gap-2 text-xs text-text-sec">
                          <input
                            type="checkbox"
                            checked={service.onlinePaymentEnabled}
                            disabled={!canOnlinePayments || togglingServiceId === service.id}
                            onChange={(event) => void toggleOnlinePayment(service, event.target.checked)}
                            className="h-4 w-4 rounded border-border-subtle accent-primary disabled:opacity-60"
                          />
                          <span>Онлайн-оплата</span>
                          {onlinePaymentsLockedMessage ? (
                            <TooltipHint text={onlinePaymentsLockedMessage ?? ""} />
                          ) : null}
                        </label>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      className="min-w-[180px] rounded-xl px-2 py-1 text-sm"
                      value={selectedMasterByService[service.id] ?? ""}
                      onChange={(event) =>
                        setSelectedMasterByService((current) => ({
                          ...current,
                          [service.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">{t.selectMaster}</option>
                      {masters.map((master) => (
                        <option key={master.id} value={master.id}>
                          {master.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      onClick={() => void assignMaster(service.id)}
                      disabled={assigningServiceId === service.id}
                      variant="secondary"
                      size="sm"
                      title={t.assignMaster}
                    >
                      {t.assignMaster}
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {service.masters.map((master) => (
                    <Chip
                      key={`${service.id}-${master.masterId}`}
                      type="button"
                      onClick={() => setDrawerMasterId(master.masterId)}
                    >
                      {master.masterName}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
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
            <Select
              value={newServiceCategoryId}
              onChange={(event) => setNewServiceCategoryId(event.target.value)}
            >
              <option value="">{t.selectCategory}</option>
              {data.categories.map((category) => (
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
              {globalCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon ? `${category.icon} ` : ""}{category.fullPath || category.title}
                </option>
              ))}
            </Select>
            {!newServiceGlobalCategoryId ? (
              <div className="text-xs text-text-sec">
                Выберите категорию, чтобы услуга отображалась на сайте.
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setShowProposeCategoryModal(true)}
              className="w-fit text-xs font-medium text-primary underline"
            >
              + Предложить свою категорию
            </button>
            {proposeCategoryMessage ? (
              <div className="text-xs text-emerald-500">{proposeCategoryMessage}</div>
            ) : null}
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
              onBlur={() => {
                setNewServicePrice((current) =>
                  current.trim() === "" ? "" : String(normalizeStudioServicePrice(Number(current)))
                );
              }}
              placeholder={t.pricePlaceholder}
            />
            <Input
              type="number"
              min={5}
              step={5}
              value={newServiceDuration}
              onChange={(event) => setNewServiceDuration(event.target.value)}
              onBlur={() => {
                setNewServiceDuration((current) =>
                  current.trim() === "" ? "" : String(normalizeStudioServiceDurationMin(Number(current)))
                );
              }}
              placeholder={t.durationPlaceholder}
            />
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
            Категория отправится на модерацию. Пока можете сохранить услугу без категории.
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
