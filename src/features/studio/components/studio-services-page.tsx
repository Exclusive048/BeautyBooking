"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { MasterCardDrawer } from "@/features/studio/components/master-card-drawer";
import { normalizeStudioServiceDurationMin, normalizeStudioServicePrice } from "@/lib/studio/service-normalization";

type StudioServiceAssignedMaster = {
  masterId: string;
  masterName: string;
};

type StudioServiceView = {
  id: string;
  title: string;
  basePrice: number;
  baseDurationMin: number;
  isActive: boolean;
  masters: StudioServiceAssignedMaster[];
};

type StudioCategoryView = {
  id: string;
  title: string;
  services: StudioServiceView[];
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
  const [newCategoryTitle, setNewCategoryTitle] = useState("");
  const [newServiceTitle, setNewServiceTitle] = useState("");
  const [newServiceCategoryId, setNewServiceCategoryId] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("10000");
  const [newServiceDuration, setNewServiceDuration] = useState("60");

  const totalServices = useMemo(
    () => data.categories.reduce((sum, category) => sum + category.services.length, 0),
    [data.categories]
  );

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const servicesParams = new URLSearchParams({ studioId });
      const servicesRes = await fetch(`/api/studio/services?${servicesParams.toString()}`, {
        cache: "no-store",
      });
      const servicesJson = (await servicesRes.json().catch(() => null)) as ApiResponse<ServicesData> | null;
      if (!servicesRes.ok || !servicesJson || !servicesJson.ok) {
        throw new Error(
          servicesJson && !servicesJson.ok ? servicesJson.error.message : `API error: ${servicesRes.status}`
        );
      }
      setData(servicesJson.data);
      if (!newServiceCategoryId && servicesJson.data.categories.length > 0) {
        setNewServiceCategoryId(servicesJson.data.categories[0].id);
      }

      const mastersParams = new URLSearchParams({ studioId });
      const mastersRes = await fetch(`/api/studio/masters?${mastersParams.toString()}`, {
        cache: "no-store",
      });
      const mastersJson = (await mastersRes.json().catch(() => null)) as ApiResponse<MastersData> | null;
      if (mastersRes.ok && mastersJson && mastersJson.ok) {
        setMasters(mastersJson.data.masters);
      } else {
        setMasters([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load services");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId]);

  const assignMaster = async (serviceId: string): Promise<void> => {
    const masterId = selectedMasterByService[serviceId];
    if (!masterId) return;
    setAssigningServiceId(serviceId);
    try {
      const res = await fetch(`/api/studio/services/${serviceId}/assign-master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioId, masterId }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ serviceId: string; masterId: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign master");
    } finally {
      setAssigningServiceId(null);
    }
  };

  const submitCategory = async (): Promise<void> => {
    if (!newCategoryTitle.trim()) return;
    setSubmittingCategory(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioId,
          title: newCategoryTitle.trim(),
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setShowCategoryModal(false);
      setNewCategoryTitle("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setSubmittingCategory(false);
    }
  };

  const submitService = async (): Promise<void> => {
    if (!newServiceTitle.trim() || !newServiceCategoryId) return;
    const normalizedPrice = normalizeStudioServicePrice(Number(newServicePrice));
    const normalizedDuration = normalizeStudioServiceDurationMin(Number(newServiceDuration));
    setNewServicePrice(String(normalizedPrice));
    setNewServiceDuration(String(normalizedDuration));

    setSubmittingService(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioId,
          categoryId: newServiceCategoryId,
          title: newServiceTitle.trim(),
          basePrice: normalizedPrice,
          baseDurationMin: normalizedDuration,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setShowServiceModal(false);
      setNewServiceTitle("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create service");
    } finally {
      setSubmittingService(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border p-5 text-sm">Loading services...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4 text-sm text-neutral-600">
        Categories: {data.categories.length} / Services: {totalServices}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowCategoryModal(true)}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
        >
          + Create category
        </button>
        <button
          type="button"
          onClick={() => setShowServiceModal(true)}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
          disabled={data.categories.length === 0}
        >
          + Add service
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {totalServices === 0 ? (
        <section className="rounded-2xl border p-5">
          <h3 className="text-base font-semibold">No services yet</h3>
          <p className="mt-1 text-sm text-neutral-600">
            Create your first category and service to start taking bookings.
          </p>
        </section>
      ) : null}

      {data.categories.map((category) => (
        <section key={category.id} className="rounded-2xl border">
          <header className="border-b p-4">
            <h2 className="text-sm font-semibold">{category.title}</h2>
          </header>
          <div className="divide-y">
            {category.services.map((service) => (
              <div key={service.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{service.title}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {service.baseDurationMin} min / {service.basePrice} KZT / {service.isActive ? "active" : "disabled"}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-lg border px-2 py-1 text-sm"
                      value={selectedMasterByService[service.id] ?? ""}
                      onChange={(event) =>
                        setSelectedMasterByService((current) => ({
                          ...current,
                          [service.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select master</option>
                      {masters.map((master) => (
                        <option key={master.id} value={master.id}>
                          {master.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void assignMaster(service.id)}
                      disabled={assigningServiceId === service.id}
                      className="rounded-lg border px-3 py-1 text-sm disabled:opacity-60"
                      title="Assign master"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {service.masters.map((master) => (
                    <button
                      key={`${service.id}-${master.masterId}`}
                      type="button"
                      onClick={() => setDrawerMasterId(master.masterId)}
                      className="rounded-full border px-2 py-0.5 text-xs hover:bg-neutral-50"
                    >
                      {master.masterName}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {showCategoryModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white p-4">
            <h3 className="text-base font-semibold">Create category</h3>
            <input
              type="text"
              value={newCategoryTitle}
              onChange={(event) => setNewCategoryTitle(event.target.value)}
              placeholder="Category title"
              className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitCategory()}
                disabled={submittingCategory}
                className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
              >
                {submittingCategory ? "Saving..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showServiceModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white p-4">
            <h3 className="text-base font-semibold">Add service</h3>
            <div className="mt-3 space-y-2">
              <select
                value={newServiceCategoryId}
                onChange={(event) => setNewServiceCategoryId(event.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Select category</option>
                {data.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.title}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newServiceTitle}
                onChange={(event) => setNewServiceTitle(event.target.value)}
                placeholder="Service title"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={0}
                step={100}
                value={newServicePrice}
                onChange={(event) => setNewServicePrice(event.target.value)}
                onBlur={() => {
                  setNewServicePrice((current) => String(normalizeStudioServicePrice(Number(current))));
                }}
                placeholder="Price"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={5}
                step={5}
                value={newServiceDuration}
                onChange={(event) => setNewServiceDuration(event.target.value)}
                onBlur={() => {
                  setNewServiceDuration((current) => String(normalizeStudioServiceDurationMin(Number(current))));
                }}
                placeholder="Duration (min)"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowServiceModal(false)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitService()}
                disabled={submittingService}
                className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
              >
                {submittingService ? "Saving..." : "Create"}
              </button>
            </div>
          </div>
        </div>
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
