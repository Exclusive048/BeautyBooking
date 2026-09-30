"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/resilient-image";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UI_FMT } from "@/lib/ui/fmt";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import {
  SERVICE_DURATION_STEP_MIN,
  SERVICE_PRICE_STEP_RUB,
  snapServiceDuration,
  snapServicePrice,
} from "../lib/service-steps";
import type {
  StudioCategoryPickerOption,
  StudioServiceDetail,
  StudioServiceMasterChip,
} from "../lib/types";
import { AssignMasterDialog } from "./assign-master-dialog";
import { DeleteServiceDialog } from "./delete-service-dialog";

const T = UI_TEXT.studioCabinet.servicesV2.detail;
const E = UI_TEXT.studioCabinet.servicesV2.errors;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

type Props = {
  studioId: string;
  detail: StudioServiceDetail;
  pickerOptions: StudioCategoryPickerOption[];
};

export function ServiceDetailPanel({ studioId, detail, pickerOptions }: Props) {
  const router = useRouter();
  const [name, setName] = useState(detail.name);
  const [price, setPrice] = useState(String(Math.round(detail.priceKopeks / 100)));
  const [duration, setDuration] = useState(String(detail.durationMin));
  const [categoryId, setCategoryId] = useState(detail.categoryId ?? "");
  const [isActive, setIsActive] = useState(detail.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [unassigning, startUnassign] = useTransition();

  useEffect(() => {
    setName(detail.name);
    setPrice(String(Math.round(detail.priceKopeks / 100)));
    setDuration(String(detail.durationMin));
    setCategoryId(detail.categoryId ?? "");
    setIsActive(detail.isActive);
    setError(null);
    setStatusMessage(null);
  }, [detail.id, detail.name, detail.priceKopeks, detail.durationMin, detail.categoryId, detail.isActive]);

  async function handleSave() {
    if (!name.trim()) {
      setError(E.titleRequired);
      return;
    }
    // FIX-SERVICE-STEPS: сетка применяется и на сохранении — blur не срабатывает
    // при отправке с клавиатуры, а сохранить надо ровно то, что показано.
    const snappedPrice = snapServicePrice(price);
    const snappedDuration = snapServiceDuration(duration);
    if (snappedPrice !== price) setPrice(snappedPrice);
    if (snappedDuration !== duration) setDuration(snappedDuration);

    const priceNum = Number.parseInt(snappedPrice, 10);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError(E.priceInvalid);
      return;
    }
    const durationNum = Number.parseInt(snappedDuration, 10);
    if (!Number.isFinite(durationNum) || durationNum < 1) {
      setError(E.durationInvalid);
      return;
    }
    setSaving(true);
    setError(null);
    setStatusMessage(null);
    try {
      await fetchJsonWithAuth<unknown>(`/api/studio/services/${detail.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studioId,
          title: name.trim(),
          basePrice: priceNum * 100,
          baseDurationMin: durationNum,
          // CATEGORY-UNIFICATION-A: send globalCategoryId (or null) — that's
          // what the public catalog filters on. Legacy ServiceCategory FK
          // is no longer managed from the new UI.
          globalCategoryId: categoryId || null,
          isActive,
        }),
      });
      setStatusMessage(T.saved);
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.saveFailed));
    } finally {
      setSaving(false);
    }
  }

  function handleUnassign(master: StudioServiceMasterChip) {
    startUnassign(async () => {
      try {
        await fetchJsonWithAuth<unknown>(
          `/api/studio/services/${detail.id}/unassign-master`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ studioId, masterId: master.id }),
          },
        );
        router.refresh();
      } catch (error) {
        setError(serverMessageOr(error, E.unassignFailed));
      }
    });
  }

  return (
    <>
      <div className="space-y-4 rounded-2xl border border-border-subtle bg-bg-card p-5">
        <header>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.caption.replace("{id}", detail.id.slice(-6).toUpperCase())}
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-text-main">
            {detail.name}
          </h2>
        </header>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-main">
              {T.nameLabel}
            </span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              maxLength={160}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-main">
                {T.priceLabel}
              </span>
              <Input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onBlur={(e) => setPrice(snapServicePrice(e.target.value))}
                disabled={saving}
                inputMode="numeric"
                type="number"
                min={0}
                step={SERVICE_PRICE_STEP_RUB}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-main">
                {T.durationLabel}
              </span>
              <Input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                onBlur={(e) => setDuration(snapServiceDuration(e.target.value))}
                disabled={saving}
                inputMode="numeric"
                type="number"
                min={SERVICE_DURATION_STEP_MIN}
                step={SERVICE_DURATION_STEP_MIN}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-main">
              {T.categoryLabel}
            </span>
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={saving}
            >
              <option value="">{T.categoryNone}</option>
              {pickerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.status === "PENDING" ? ` · ${T.pendingSuffix}` : ""}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-input/30 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-main">
              {T.isActiveLabel}
            </p>
            <p className="mt-0.5 text-[11px] text-text-sec">
              {T.isActiveHint}
            </p>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={(value) => setIsActive(value)}
          />
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-xs font-mono uppercase tracking-wide text-text-sec">
              {T.mastersLabel.replace(
                "{count}",
                String(detail.assignedMasters.length),
              )}
            </p>
            <Button variant="wrapper"
              onClick={() => setAssignOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent-text transition-colors hover:bg-primary/10"
              data-guide="assign"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              {T.assignMaster}
            </Button>
          </div>
          {detail.assignedMasters.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-subtle bg-bg-input/30 px-3 py-2 text-xs text-text-sec">
              {T.mastersEmpty}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {detail.assignedMasters.map((master) => (
                <li
                  key={master.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-input/40 py-1 pl-1 pr-2"
                >
                  <Link
                    href={`/cabinet/studio/team?master=${master.id}`}
                    className="inline-flex items-center gap-1.5"
                    title={master.displayName}
                  >
                    {master.avatarUrl ? (
                      <ResilientImage
                        src={master.avatarUrl}
                        alt=""
                        width={20}
                        height={20}
                        className="h-5 w-5 rounded-full object-cover ring-1 ring-border-subtle"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="grid h-5 w-5 place-items-center rounded-full bg-bg-card text-[10px] font-semibold text-text-sec ring-1 ring-border-subtle"
                      >
                        {initials(master.displayName)}
                      </span>
                    )}
                    <span className="text-xs text-text-main">{master.displayName}</span>
                  </Link>
                  <Button variant="wrapper"
                    onClick={() => handleUnassign(master)}
                    disabled={unassigning}
                    className="ml-0.5 inline-grid h-4 w-4 place-items-center rounded-full text-text-sec transition-colors hover:bg-bg-card hover:text-text-main"
                    aria-label={T.unassignMaster}
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border-subtle bg-bg-input/30 p-3">
          <p className="mb-2 text-xs font-mono uppercase tracking-wide text-text-sec">
            {T.statsTitle}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-text-sec">{T.statsBookings}</p>
              <p className="mt-0.5 font-display text-base font-semibold tabular-nums text-text-main">
                {detail.stats30d.bookingsCount.toLocaleString("ru-RU")}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-text-sec">{T.statsRevenue}</p>
              <p className="mt-0.5 font-display text-base font-semibold tabular-nums text-text-main">
                {UI_FMT.priceLabel(detail.stats30d.revenueKopeks)}
              </p>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text">
            {error}
          </div>
        ) : null}
        {statusMessage ? (
          <div className="rounded-lg border border-success-border bg-success-surface px-3 py-2 text-sm text-success-text">
            {statusMessage}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="ghost"
            onClick={() => setDeleteOpen(true)}
            disabled={saving}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {T.delete}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? T.saving : T.save}
          </Button>
        </div>
      </div>

      <AssignMasterDialog
        studioId={studioId}
        serviceId={detail.id}
        availableMasters={detail.availableMasters}
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
      />
      <DeleteServiceDialog
        studioId={studioId}
        serviceId={detail.id}
        serviceName={detail.name}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </>
  );
}
