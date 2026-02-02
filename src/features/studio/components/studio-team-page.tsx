"use client";

import { useEffect, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { MasterCardDrawer } from "@/features/studio/components/master-card-drawer";

export type StudioTeamMaster = {
  id: string;
  name: string;
  isActive: boolean;
  title: string;
};

type MastersData = {
  masters: StudioTeamMaster[];
};

type Props = {
  studioId: string;
};

export function StudioTeamPage({ studioId }: Props) {
  const [masters, setMasters] = useState<StudioTeamMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ studioId });
      const res = await fetch(`/api/studio/masters?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<MastersData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setMasters(json.data.masters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load masters");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId]);

  const createMaster = async (): Promise<void> => {
    if (!displayName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioId,
          displayName: displayName.trim(),
          phone: phone.trim() || undefined,
          title: title.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setShowCreateModal(false);
      setDisplayName("");
      setPhone("");
      setTitle("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create master");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border p-5 text-sm">Loading team...</div>;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-neutral-600">Masters: {masters.length}</div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          + Add master
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {masters.length === 0 ? (
        <section className="rounded-2xl border p-5">
          <h3 className="text-base font-semibold">No masters yet</h3>
          <p className="mt-1 text-sm text-neutral-600">Add your first master to start filling the schedule.</p>
        </section>
      ) : null}

      <div className="grid gap-3">
        {masters.map((master) => (
          <button
            key={master.id}
            type="button"
            onClick={() => setSelectedMasterId(master.id)}
            className="rounded-2xl border p-4 text-left transition hover:bg-neutral-50"
          >
            <div className="font-medium">{master.name}</div>
            <div className="mt-1 text-xs text-neutral-500">
              {master.isActive ? "Active" : "Inactive"}
              {master.title ? ` · ${master.title}` : ""}
            </div>
          </button>
        ))}
      </div>

      {showCreateModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white p-4">
            <h3 className="text-base font-semibold">Add master</h3>
            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Name"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Phone (optional)"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title (optional)"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void createMaster()}
                disabled={submitting}
                className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
              >
                {submitting ? "Saving..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
