"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type MasterItem = {
  id: string;
  name: string;
  studioId: string | null;
};

type InviteItem = {
  id: string;
  phone: string;
  status: "PENDING" | "ACTIVE" | "REJECTED";
  createdAt: string;
};

type Props = {
  studioId: string;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function StudioMastersPanel({ studioId }: Props) {
  const [items, setItems] = useState<MasterItem[]>([]);
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [inviteSent, setInviteSent] = useState<string | null>(null);

  const endpoint = useMemo(() => `/api/studios/${studioId}/masters`, [studioId]);
  const invitesEndpoint = useMemo(() => `/api/studios/${studioId}/invites`, [studioId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ masters: MasterItem[] }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, `API error: ${res.status}`));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to load masters"));
      setItems(json.data.masters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  const loadInvites = useCallback(async () => {
    setLoadingInvites(true);
    try {
      const res = await fetch(invitesEndpoint, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ invites: InviteItem[] }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, `API error: ${res.status}`));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to load invites"));
      setInvites(json.data.invites);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingInvites(false);
    }
  }, [invitesEndpoint]);

  useEffect(() => {
    void load();
    void loadInvites();
  }, [load, loadInvites]);

  const attach = async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setError("??????? ????? ????????");
      return;
    }
    setSaving(true);
    setError(null);
    setInviteSent(null);
    try {
      const res = await fetch(invitesEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmed }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ invite: InviteItem }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to send invite"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to send invite"));
      setInvites((prev) => [json.data.invite, ...prev.filter((i) => i.id !== json.data.invite.id)]);
      setPhone("");
      setInviteSent("??????????? ??????????");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const detach = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterProviderId: id }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ master: MasterItem }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to detach master"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to detach master"));
      setItems((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border p-5 text-sm text-neutral-600">???????? ?????????</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="text-sm font-semibold">?????????? ??????? ?? ????????</div>
        <div className="flex flex-wrap gap-3">
          <input
            className="rounded-xl border px-3 py-2 text-sm flex-1 min-w-[200px]"
            placeholder="??????? ???????"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button
            type="button"
            onClick={attach}
            disabled={saving}
            className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            ??????????
          </button>
        </div>
        {inviteSent ? (
          <div className="text-xs text-green-700">{inviteSent}</div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border p-4 text-sm text-red-600">??????: {error}</div>
      ) : null}

      <div className="space-y-3">
        <div className="text-sm font-semibold">???????????</div>
        {loadingInvites ? (
          <div className="rounded-2xl border p-4 text-sm text-neutral-600">
            ???????? ????????????
          </div>
        ) : invites.length === 0 ? (
          <div className="rounded-2xl border p-4 text-sm text-neutral-600">
            ??????????? ???? ???.
          </div>
        ) : (
          invites.map((invite) => (
            <div key={invite.id} className="rounded-2xl border p-4">
              <div className="text-sm text-neutral-700">{invite.phone}</div>
              <div className="text-xs text-neutral-500">??????: {invite.status}</div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold">??????? ??????</div>
        {items.length === 0 ? (
          <div className="rounded-2xl border p-4 text-sm text-neutral-600">???????? ???? ???.</div>
        ) : (
          items.map((m) => (
            <div key={m.id} className="rounded-2xl border p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-neutral-500">{m.id}</div>
              </div>
              <button
                type="button"
                onClick={() => detach(m.id)}
                disabled={saving}
                className="rounded-xl border px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                ???????
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
