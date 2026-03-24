"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { ScheduleRequestsPanel } from "@/features/schedule/components/schedule-requests-panel";
import { MasterCardDrawer } from "@/features/studio/components/master-card-drawer";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { usePlanFeatures } from "@/lib/billing/use-plan-features";

export type StudioTeamMaster = {
  id: string;
  name: string;
  isActive: boolean;
  title: string;
  status: "PENDING" | "ACTIVE";
  phone: string | null;
};

type MastersData = {
  masters: StudioTeamMaster[];
};

type Props = {
  studioId: string;
};

export function StudioTeamPage({ studioId }: Props) {
  const t = UI_TEXT.studioCabinet.team;
  const [masters, setMasters] = useState<StudioTeamMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<StudioTeamMaster | null>(null);
  const [removeTransferServices, setRemoveTransferServices] = useState(true);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const plan = usePlanFeatures("STUDIO");

  const mastersCountText = useMemo(() => t.mastersCount.replace("{count}", String(masters.length)), [masters.length, t.mastersCount]);
  const teamLimit = plan.limit("maxTeamMasters");
  const limitReached = teamLimit !== null && masters.length >= teamLimit;
  const limitSoftWarning = teamLimit !== null && masters.length >= Math.max(teamLimit - 1, 1);
  const limitLabel =
    teamLimit === null ? t.noLimit : `${masters.length} / ${teamLimit}`;

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ studioId });
      const res = await fetch(`/api/studio/masters?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<MastersData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }
      setMasters(json.data.masters);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId, t.apiErrorPrefix, t.loadFailed]);

  const createMaster = async (): Promise<void> => {
    const name = displayName.trim();
    const normalizedPhone = normalizeRussianPhone(phone);
    const roleTitle = title.trim();

    if (!name || !roleTitle || !normalizedPhone) {
      setError(t.requiredError);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioId,
          displayName: name,
          phone: normalizedPhone,
          title: roleTitle,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }
      setShowCreateModal(false);
      setDisplayName("");
      setPhone("");
      setTitle("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.createFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const openRemoveModal = (master: StudioTeamMaster): void => {
    setRemoveTarget(master);
    setRemoveTransferServices(true);
    setError(null);
  };

  const removeMaster = async (): Promise<void> => {
    if (!removeTarget) return;

    setRemoveSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cabinet/studio/members/${removeTarget.id}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferServices: removeTransferServices }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ masterId: string; transferredServices: number }>
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }

      if (selectedMasterId === removeTarget.id) {
        setSelectedMasterId(null);
      }
      setRemoveTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.removeFailed);
    } finally {
      setRemoveSubmitting(false);
    }
  };

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>;
  }

  return (
    <section className="space-y-3">
      <ScheduleRequestsPanel />
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-text-sec">
          {mastersCountText}
          {teamLimit !== null ? (
            <span className={`ml-2 text-xs ${limitSoftWarning ? "text-amber-600" : "text-text-sec"}`}>
              {limitLabel}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          onClick={() => setShowCreateModal(true)}
          variant="secondary"
          size="sm"
          disabled={limitReached}
        >
          + {t.addMaster}
        </Button>
      </div>

      {limitReached ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          {t.limitReachedMessage}{" "}
          <a href="/cabinet/billing?scope=STUDIO" className="underline">
            {t.viewPlans}
          </a>
          .
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {masters.length === 0 ? (
        <section className="lux-card rounded-[24px] p-5">
          <h3 className="text-base font-semibold text-text-main">{t.noMastersTitle}</h3>
          <p className="mt-1 text-sm text-text-sec">{t.noMastersDescription}</p>
        </section>
      ) : null}

      <div className="grid gap-3">
        {masters.map((master) => (
          <div
            key={master.id}
            className="lux-card rounded-[24px] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-hover"
          >
            <button type="button" onClick={() => setSelectedMasterId(master.id)} className="w-full text-left">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-text-main">{master.name}</div>
                <span
                  className={
                    master.status === "PENDING"
                      ? "rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                      : "rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                  }
                >
                  {master.status === "PENDING" ? t.pending : t.active}
                </span>
              </div>
              <div className="mt-1 text-xs text-text-sec">
                {master.status === "PENDING" ? t.pending : t.active}
                {master.title ? `${t.roleSeparator}${master.title}` : ""}
              </div>
              {master.status === "PENDING" && master.phone ? (
                <div className="mt-1 text-xs text-text-sec">{master.phone}</div>
              ) : null}
            </button>
            <div className="mt-3 flex justify-end">
              <Button type="button" variant="danger" size="sm" onClick={() => openRemoveModal(master)}>
                {t.removeAction}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ModalSurface open={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-text-main">{t.addMasterTitle}</h3>
          <div className="space-y-2">
            <Input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t.masterNamePlaceholder}
              required
            />
            <Input
              type="text"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={t.phonePlaceholder}
              required
            />
            <Input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t.titlePlaceholder}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setShowCreateModal(false)} variant="secondary">
              {t.cancel}
            </Button>
            <Button type="button" onClick={() => void createMaster()} disabled={submitting}>
              {submitting ? t.creating : t.save}
            </Button>
          </div>
        </div>
      </ModalSurface>

      <ModalSurface
        open={Boolean(removeTarget)}
        onClose={() => {
          if (!removeSubmitting) setRemoveTarget(null);
        }}
        title={
          removeTarget
            ? t.removeTitle.replace("{name}", removeTarget.name)
            : t.removeTitleFallback
        }
      >
        <div className="space-y-4">
          <label className="flex items-start gap-2 text-sm text-text-main">
            <input
              type="checkbox"
              checked={removeTransferServices}
              onChange={(event) => setRemoveTransferServices(event.target.checked)}
              disabled={removeSubmitting}
              className="mt-0.5"
            />
            <span>
              {t.transferServicesLabel}
              <span className="mt-1 block text-xs text-text-sec">
                {t.transferServicesHint}
              </span>
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRemoveTarget(null)}
              disabled={removeSubmitting}
            >
              {t.cancel}
            </Button>
            <Button type="button" variant="danger" onClick={() => void removeMaster()} disabled={removeSubmitting}>
              {removeSubmitting ? t.removing : t.removeAction}
            </Button>
          </div>
        </div>
      </ModalSurface>

      {selectedMasterId ? (
        <MasterCardDrawer
          studioId={studioId}
          masterId={selectedMasterId}
          onClose={() => setSelectedMasterId(null)}
          onSaved={() => {
            void load();
          }}
        />
      ) : null}
    </section>
  );
}
