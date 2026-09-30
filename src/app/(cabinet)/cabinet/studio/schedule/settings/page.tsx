import { ProviderType } from "@prisma/client";
import { redirect } from "next/navigation";
import { StudioScheduleSettingsPage } from "@/features/studio-cabinet/schedule-settings/components/studio-schedule-settings-page";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { buildScheduleSnapshot } from "@/lib/schedule/editor";
import { isStudioMasterActive } from "@/lib/studio/master-eligibility";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

type SearchParams = {
  /** Master picker selection (cuid). */
  master?: string;
  /** Active tab. */
  tab?: string;
};

type Props = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export const dynamic = "force-dynamic";

/**
 * STUDIO-SCHEDULE-SETTINGS-A — Phase A foundation.
 *
 * Studio version of `/cabinet/master/schedule/settings`. **No new
 * backend endpoint** — `/api/cabinet/master/schedule` already handles
 * the `STUDIO_ADMIN` actor mode via `?studioId=…&masterId=…` query
 * params (see `resolveScheduleActor` (`lib/schedule/schedule-actor.ts`)). This page just
 * presents the UI with a master picker + tabs shell. Phase A
 * ships Hours + Rules tabs; Visibility / Breaks / Exceptions are
 * placeholders deferred to Phase B.
 *
 * Schema: per-master (factом из существующей схемы — no migration).
 * Each master has their own `WeeklyScheduleConfig` + `ScheduleOverride`
 * + Provider-level rule fields. Studio admin selects a master, then
 * edits that master's settings.
 */
export default async function StudioScheduleSettingsRoute({
  searchParams,
}: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  let studioProviderId: string;
  try {
    const access = await resolveCurrentStudioAccess(user.id);
    studioId = access.studioId;
    const studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: { providerId: true },
    });
    if (!studio) redirect("/403");
    studioProviderId = studio.providerId;
  } catch {
    redirect("/403");
  }

  // Load active masters of this studio for the picker. Filter via
  // `isStudioMasterActive` (invariant #24 — ownerUserId + !studioPaused)
  // so the studio admin can't accidentally edit an INVITED or DISABLED
  // master's schedule.
  const mastersRaw = await prisma.provider.findMany({
    where: { type: ProviderType.MASTER, studioId: studioProviderId },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      ownerUserId: true,
      studioPaused: true,
    },
    orderBy: { name: "asc" },
  });
  const masters = mastersRaw
    .filter((m) => isStudioMasterActive(m))
    .map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl ?? null }));

  const params =
    searchParams instanceof Promise ? await searchParams : searchParams;
  // Master picker resolution: explicit `?master=<cuid>` wins; otherwise
  // first active master (audit-pattern from MoveBookingDialog #2). If
  // the studio has no active masters, no snapshot to load — UI shows
  // an empty state.
  const requestedMasterId = params?.master?.trim() || null;
  const selectedMasterId =
    requestedMasterId && masters.some((m) => m.id === requestedMasterId)
      ? requestedMasterId
      : masters[0]?.id ?? null;

  const snapshot = selectedMasterId
    ? await buildScheduleSnapshot(selectedMasterId)
    : null;

  return (
    <StudioScheduleSettingsPage
      studioId={studioId}
      masters={masters}
      selectedMasterId={selectedMasterId}
      snapshot={snapshot}
    />
  );
}
