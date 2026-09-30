"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ExternalLink, Pause, Pencil, Play, UserMinus, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/resilient-image";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import {
  STATUS_BADGE_CLASS,
  getStatusTone,
} from "../lib/status-display";
import type { StudioMasterDetail } from "../server/types";
import { EditMasterProfileDialog } from "./edit-master-profile-dialog";
import { PauseMasterDialog } from "./pause-master-dialog";
import { RemoveMasterDialog } from "./remove-master-dialog";
import { RevokeInviteDialog } from "./revoke-invite-dialog";

const T = UI_TEXT.studioCabinet.mastersV2.detail;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

function statusLabel(status: StudioMasterDetail["status"]): string {
  if (status === "ACTIVE") return UI_TEXT.studioCabinet.mastersV2.status.active;
  if (status === "INVITED") return UI_TEXT.studioCabinet.mastersV2.status.invited;
  return UI_TEXT.studioCabinet.mastersV2.status.disabled;
}

function formatJoinedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("ru-RU", { year: "numeric", month: "long" });
}

export function MasterDetailHeader({
  studioId,
  detail,
}: {
  studioId: string;
  detail: StudioMasterDetail;
}) {
  const [pauseOpen, setPauseOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const tone = getStatusTone(detail.status);
  // FIX-STUDIO-02 (F7): an INVITED master is an unclaimed stub — pausing it is
  // meaningless (it accepts no bookings). Offer «Отозвать приглашение» instead;
  // pause/activate stay for real (ACTIVE/DISABLED) masters.
  const isInvited = detail.status === "INVITED";
  const mode: "pause" | "activate" = detail.status === "DISABLED" ? "activate" : "pause";

  return (
    <>
      <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
        <div className="flex flex-wrap items-start gap-4">
          {detail.avatarUrl ? (
            <ResilientImage
              src={detail.avatarUrl}
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
            />
          ) : (
            <span
              aria-hidden
              className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-bg-input text-lg font-semibold text-text-sec ring-1 ring-border-subtle"
            >
              {initialsOf(detail.displayName)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-display text-xl font-bold text-text-main md:text-2xl">
                {detail.displayName}
              </h2>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  STATUS_BADGE_CLASS[tone],
                )}
              >
                {statusLabel(detail.status)}
              </span>
              {detail.isCurrentUser ? (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent-text">
                  {T.youChip}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-text-sec">
              {detail.servicesSummary ? `${detail.servicesSummary} · ` : ""}
              {T.joinedTemplate.replace("{date}", formatJoinedDate(detail.joinedAt))}
            </p>
            {detail.phone || detail.email ? (
              <p className="mt-2 text-xs text-text-sec">
                {[detail.phone, detail.email].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-text-sec">
              {T.clientsTemplate.replace("{count}", String(detail.clientsCount))}
            </p>
            {!isInvited && detail.blockingStudioBookings > 0 ? (
              <p className="mt-2 rounded-xl border border-warning-border bg-warning-surface px-3 py-2 text-xs text-warning-text">
                {T.blockingBookings(detail.blockingStudioBookings)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* STUDIO-MASTERS-PRIVACY-FIX-A: opaque HMAC token replaces
              the raw master cuid in the URL. Calendar route verifies
              against the current studio scope. Same pattern as the
              client-history token in MASTER-CLIENTS-FIX-A. */}
          <Link
            href={`/cabinet/studio/calendar?master=${encodeURIComponent(detail.viewToken)}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border-subtle bg-bg-card px-3 text-sm font-medium text-text-main transition-colors hover:bg-bg-input"
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {T.actions.schedule}
          </Link>
          {/* STUDIO-EDIT-MASTER-PROFILE-01: имя, специализация, описание, фото. */}
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {T.actions.editProfile}
          </Button>
          {detail.publicProfileUrl ? (
            <Link
              href={detail.publicProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border-subtle bg-bg-card px-3 text-sm font-medium text-text-main transition-colors hover:bg-bg-input"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {T.actions.publicProfile}
            </Link>
          ) : null}
          {/* STUDIO-CLEANUP-FIX-A #4а: «Написать» button removed.
              The Link routed to `/cabinet/(user)/messages?with=...`
              — the client-cabinet messages page — but studio admin
              is not a chat participant (invariant #26: chat ACL =
              client↔master only, 152-ФЗ privacy). The thread didn't
              exist and the page rendered empty. Studio-admin chat is
              parked в backlog as a deferred feature requiring
              product + legal decision on the invariant evolution. */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* 29.09 доработки · 04: исключение из студии — для работающих и на
                паузе; владелец может исключить и себя (решение владельца). */}
            {!isInvited ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setRemoveOpen(true)}
                data-testid="studio-master-remove"
              >
                <UserMinus className="h-3.5 w-3.5" aria-hidden />
                {T.actions.remove}
              </Button>
            ) : null}
            {isInvited ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setRevokeOpen(true)}
              >
                <UserX className="h-3.5 w-3.5" aria-hidden />
                {T.actions.revoke}
              </Button>
            ) : (
              <Button
                variant={mode === "pause" ? "secondary" : "primary"}
                size="sm"
                onClick={() => setPauseOpen(true)}
              >
                {mode === "pause" ? (
                  <Pause className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Play className="h-3.5 w-3.5" aria-hidden />
                )}
                {mode === "pause" ? T.actions.pause : T.actions.activate}
              </Button>
            )}
          </div>
        </div>
      </section>

      {!isInvited ? (
        <RemoveMasterDialog
          studioId={studioId}
          masterId={detail.id}
          masterName={detail.displayName}
          viewToken={detail.viewToken}
          open={removeOpen}
          onClose={() => setRemoveOpen(false)}
        />
      ) : null}

      {isInvited ? (
        <RevokeInviteDialog
          studioId={studioId}
          masterId={detail.id}
          masterName={detail.displayName}
          open={revokeOpen}
          onClose={() => setRevokeOpen(false)}
        />
      ) : (
        <PauseMasterDialog
          studioId={studioId}
          masterId={detail.id}
          masterName={detail.displayName}
          mode={mode}
          open={pauseOpen}
          onClose={() => setPauseOpen(false)}
        />
      )}
      {editOpen ? (
        <EditMasterProfileDialog
          key={detail.providerId}
          studioId={studioId}
          detail={detail}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
    </>
  );
}
