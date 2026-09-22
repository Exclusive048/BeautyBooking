import { studioReviewsWhere } from "@/lib/reviews/studio-scope";
import {
  MembershipStatus,
  ProviderType,
  StudioRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
import { formatReviewDateLabel } from "../lib/format";
import type {
  StudioReviewFilter,
  StudioReviewItem,
  StudioReviewMasterChip,
  StudioReviewsFilterCounts,
  StudioReviewsListData,
} from "../lib/types";

const PAGE_LIMIT = 20;

/**
 * STUDIO-REVIEWS-A — list reviews for a studio cabinet page.
 *
 * Loads every (non-deleted) review tied to the studio, classifies the
 * caller's CRM scope (OWNER/ADMIN → reply to all; MASTER → reply only
 * to own), computes filter counts from the FULL set, then applies the
 * requested filter + cursor pagination. Master + service names come
 * from a single batched booking join (no N+1).
 *
 * Reply identity stays implicit. The UI labels every reply «Ответ
 * студии» regardless of who typed it — there is no `repliedByUserId`
 * column in the schema and the spec excludes per-master attribution.
 */

export type LoadStudioReviewsInput = {
  studioId: string;
  currentUserId: string;
  filter: StudioReviewFilter;
  masterId?: string | "all";
  cursor?: string;
};

type ScopeRoles = {
  isStudioAdmin: boolean;
  /** Provider id of the master account for this user inside the studio
   *  (when the user is a MASTER member). Used to gate `canReply`. */
  masterProviderId: string | null;
};

async function resolveScope(studioId: string, currentUserId: string): Promise<ScopeRoles> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { id: true, providerId: true, ownerUserId: true },
  });
  if (!studio) return { isStudioAdmin: false, masterProviderId: null };

  // Direct OWNER pointer is the simplest path.
  if (studio.ownerUserId === currentUserId) {
    return { isStudioAdmin: true, masterProviderId: null };
  }

  const membership = await prisma.studioMembership.findFirst({
    where: {
      studioId,
      userId: currentUserId,
      status: MembershipStatus.ACTIVE,
    },
    select: { roles: true },
  });
  if (!membership) return { isStudioAdmin: false, masterProviderId: null };

  const isStudioAdmin =
    membership.roles.includes(StudioRole.OWNER) ||
    membership.roles.includes(StudioRole.ADMIN);

  let masterProviderId: string | null = null;
  if (membership.roles.includes(StudioRole.MASTER)) {
    const masterProvider = await prisma.provider.findFirst({
      where: {
        ownerUserId: currentUserId,
        type: ProviderType.MASTER,
        studioId: studio.providerId,
      },
      select: { id: true },
    });
    masterProviderId = masterProvider?.id ?? null;
  }

  return { isStudioAdmin, masterProviderId };
}

export async function loadStudioReviewsList(input: LoadStudioReviewsInput): Promise<StudioReviewsListData> {
  const scope = await resolveScope(input.studioId, input.currentUserId);

  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    return emptyResult();
  }

  // Single broad query covers everything we need to render the page:
  // distribution, top-services, filter counts, and the table rows.
  // For studio scope we anchor on `studioId` (denormalized in Review)
  // — it's the authoritative "this review belongs to a master in this
  // studio" pointer.
  const reviews = await prisma.review.findMany({
    where: {
      ...ACTIVE_REVIEW_FILTER,
      // STUDIO-REVIEWS-SCOPE-01: и отзывы с целью `studio` без `studioId`.
      ...studioReviewsWhere(studio),
    },
    select: {
      id: true,
      rating: true,
      text: true,
      replyText: true,
      repliedAt: true,
      reportedAt: true,
      createdAt: true,
      masterId: true,
      bookingId: true,
      author: { select: { displayName: true, firstName: true, lastName: true } },
      master: { select: { id: true, name: true } },
      booking: {
        select: {
          service: { select: { name: true, title: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const allMasters = await prisma.provider.findMany({
    where: { type: ProviderType.MASTER, studioId: studio.providerId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const masterOptions: StudioReviewMasterChip[] = allMasters.map((m) => ({
    id: m.id,
    displayName: m.name,
  }));

  const now = new Date();
  const allItems: StudioReviewItem[] = reviews.map((r) => {
    const clientName =
      r.author?.displayName?.trim() ||
      `${r.author?.firstName ?? ""} ${r.author?.lastName ?? ""}`.trim() ||
      "Клиент";
    const serviceName =
      r.booking?.service?.title?.trim() ||
      r.booking?.service?.name?.trim() ||
      null;
    const canReply = scope.isStudioAdmin
      ? true
      : Boolean(scope.masterProviderId && scope.masterProviderId === r.masterId);
    return {
      id: r.id,
      clientName,
      rating: r.rating,
      createdAt: r.createdAt.toISOString(),
      dateLabel: formatReviewDateLabel(r.createdAt.toISOString(), now),
      master: r.master
        ? { id: r.master.id, displayName: r.master.name }
        : null,
      serviceName,
      text: r.text ?? "",
      reply:
        r.replyText && r.repliedAt
          ? { text: r.replyText, repliedAt: r.repliedAt.toISOString() }
          : null,
      canReply,
      isReported: Boolean(r.reportedAt),
    };
  });

  const filterCounts: StudioReviewsFilterCounts = {
    all: allItems.length,
    no_reply: allItems.filter((r) => !r.reply).length,
    low_rating: allItems.filter((r) => r.rating <= 3).length,
    five_star: allItems.filter((r) => r.rating === 5).length,
  };

  // Apply filters
  const masterFilter = input.masterId && input.masterId !== "all" ? input.masterId : null;
  const filtered = allItems.filter((r) => {
    if (masterFilter && r.master?.id !== masterFilter) return false;
    switch (input.filter) {
      case "no_reply":
        return !r.reply;
      case "low_rating":
        return r.rating <= 3;
      case "five_star":
        return r.rating === 5;
      default:
        return true;
    }
  });

  // Cursor pagination — cursor = id of the last visible review.
  const cursorIndex = input.cursor ? filtered.findIndex((r) => r.id === input.cursor) : -1;
  const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const slice = filtered.slice(startIndex, startIndex + PAGE_LIMIT + 1);
  let nextCursor: string | null = null;
  if (slice.length > PAGE_LIMIT) {
    nextCursor = slice[PAGE_LIMIT - 1]!.id;
    slice.pop();
  }

  return {
    items: slice,
    filterCounts,
    nextCursor,
    masterOptions,
    totalReviewsCount: allItems.length,
    unansweredCount: filterCounts.no_reply,
  };
}

function emptyResult(): StudioReviewsListData {
  return {
    items: [],
    filterCounts: { all: 0, no_reply: 0, low_rating: 0, five_star: 0 },
    nextCursor: null,
    masterOptions: [],
    totalReviewsCount: 0,
    unansweredCount: 0,
  };
}
