"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { StudioHeroGallery } from "@/features/public-studio/studio-hero-gallery";
import { StudioMastersCarousel } from "@/features/public-studio/studio-masters-carousel";
import { StudioBookingFlow } from "@/features/public-studio/studio-booking-flow/booking-flow";
import { StudioServicesList } from "@/features/public-studio/studio-services-list";
import { moneyRUB } from "@/lib/format";
import type { MediaAssetDto } from "@/lib/media/types";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { ReviewDto } from "@/lib/reviews/types";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import {
  fetchStudioMasters,
  fetchStudioProfile,
  type StudioMaster,
} from "@/features/booking/lib/studio-booking";

type ClientBooking = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  provider: { id: string };
};

function stars(value: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return "*".repeat(rounded) + "-".repeat(5 - rounded);
}

export default function StudioProfilePage() {
  const params = useParams<{ studioId: string }>();
  const studioId = params?.studioId;

  const [studio, setStudio] = useState<ProviderProfileDto | null>(null);
  const [masters, setMasters] = useState<StudioMaster[]>([]);
  const [portfolio, setPortfolio] = useState<MediaAssetDto[]>([]);
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [canReviewBookingId, setCanReviewBookingId] = useState<string | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studioId) return;
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [profileRes, mastersRes] = await Promise.all([
          fetchStudioProfile(studioId),
          fetchStudioMasters(studioId),
        ]);

        if (!profileRes.ok) throw new Error(profileRes.error);
        if (profileRes.provider.type !== "STUDIO") {
          throw new Error(UI_TEXT.publicStudio.studioOnlyProfileError);
        }

        if (!alive) return;
        setStudio(profileRes.provider);
        setMasters(mastersRes.ok ? mastersRes.masters : []);

        const [mediaRes, reviewsRes] = await Promise.all([
          fetch(
            `/api/media?entityType=STUDIO&entityId=${encodeURIComponent(profileRes.provider.id)}&kind=PORTFOLIO`,
            { cache: "no-store" }
          ),
          fetch(
            `/api/reviews?targetType=studio&targetId=${encodeURIComponent(profileRes.provider.id)}&limit=3&offset=0`,
            { cache: "no-store" }
          ),
        ]);

        const mediaJson = (await mediaRes.json().catch(() => null)) as ApiResponse<{ assets: MediaAssetDto[] }> | null;
        if (alive && mediaRes.ok && mediaJson && mediaJson.ok) {
          setPortfolio(mediaJson.data.assets);
        }

        const reviewsJson = (await reviewsRes.json().catch(() => null)) as ApiResponse<{ reviews: ReviewDto[] }> | null;
        if (alive && reviewsRes.ok && reviewsJson && reviewsJson.ok) {
          setReviews(reviewsJson.data.reviews);
        }

        const bookingsRes = await fetch("/api/me/bookings", { cache: "no-store" });
        const bookingsJson = (await bookingsRes.json().catch(() => null)) as ApiResponse<{ bookings: ClientBooking[] }> | null;
        if (alive && bookingsRes.ok && bookingsJson && bookingsJson.ok) {
          const ownBookings = bookingsJson.data.bookings.filter(
            (booking) => booking.provider.id === profileRes.provider.id
          );
          let eligibleBookingId: string | null = null;
          for (const booking of ownBookings) {
            const canLeaveRes = await fetch(
              `/api/reviews/can-leave?bookingId=${encodeURIComponent(booking.id)}`,
              { cache: "no-store" }
            );
            const canLeaveJson = (await canLeaveRes.json().catch(() => null)) as ApiResponse<{ canLeave: boolean }> | null;
            if (canLeaveRes.ok && canLeaveJson && canLeaveJson.ok && canLeaveJson.data.canLeave) {
              eligibleBookingId = booking.id;
              break;
            }
          }
          if (alive) setCanReviewBookingId(eligibleBookingId);
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : UI_TEXT.publicStudio.bookingError);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [studioId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-text">{UI_TEXT.publicStudio.loadingProfile}</div>
        </CardContent>
      </Card>
    );
  }

  if (error || !studio) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-text">{UI_TEXT.publicStudio.loadFailedTitle}</div>
          <div className="mt-2 text-sm text-text-muted">{error ?? UI_TEXT.publicStudio.notFound}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <StudioHeroGallery studio={studio} imageUrls={portfolio.map((item) => item.url)} />

      <div id="studio-booking-entry" className="rounded-2xl border border-border bg-surface p-5 md:p-6">
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="text-lg font-semibold text-text">{UI_TEXT.publicStudio.heroBook}</div>
          <Button asChild variant="secondary">
            <Link href={`/studios/${studio.id}/booking`}>{UI_TEXT.publicStudio.openBookingFlow}</Link>
          </Button>
        </div>
        <StudioBookingFlow studioId={studio.id} />
      </div>

      <Card className="bg-surface">
        <CardContent className="space-y-4 p-5 md:p-6">
          {studio.avatarUrl ? (
            <img src={studio.avatarUrl} alt="" className="h-20 w-20 rounded-2xl object-cover" />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{UI_TEXT.publicStudio.typeStudio}</Badge>
            {studio.availableToday ? <Badge>{UI_TEXT.publicStudio.availableToday}</Badge> : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-text-muted">
              <span className="font-semibold text-text">{studio.rating.toFixed(1)}</span>{" "}
              <span>({studio.reviews} {UI_TEXT.publicStudio.reviewsCountLabel})</span>
            </div>
            <div className="text-sm text-text">
              {UI_TEXT.publicStudio.from} <span className="font-semibold">{moneyRUB(studio.priceFrom)}</span>
            </div>
          </div>
          <div className="text-sm text-text-muted">
            {studio.district} / {studio.address}
          </div>
          <div className="flex flex-wrap gap-2">
            {studio.categories.length ? (
              studio.categories.map((c) => <Badge key={c}>{c}</Badge>)
            ) : (
              <Badge>{UI_TEXT.publicStudio.noCategories}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Section title={UI_TEXT.publicStudio.sectionPhotos} subtitle={UI_TEXT.publicStudio.sectionPhotosSubtitle}>
        <Card className="bg-surface">
          <CardContent className="p-5 md:p-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {portfolio.length > 0
                ? portfolio.map((asset) => (
                    <div key={asset.id} className="aspect-square overflow-hidden rounded-2xl border border-border bg-muted">
                      <img src={asset.url} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))
                : Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-2xl border border-border bg-muted" />
                  ))}
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title={UI_TEXT.publicStudio.sectionReviews} subtitle={UI_TEXT.publicStudio.sectionReviewsSubtitle}>
        <Card className="bg-surface">
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-text-muted">
                {stars(studio.rating)} / {studio.reviews} {UI_TEXT.publicStudio.reviewsCountLabel}
              </div>
              {canReviewBookingId && !showReviewForm ? (
                <button
                  type="button"
                  onClick={() => setShowReviewForm(true)}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50"
                >
                  {UI_TEXT.publicStudio.reviewLeave}
                </button>
              ) : null}
            </div>

            {showReviewForm && canReviewBookingId ? (
              <div className="mt-4">
                <ReviewForm
                  bookingId={canReviewBookingId}
                  onCancel={() => setShowReviewForm(false)}
                  onSubmitted={async (created) => {
                    setShowReviewForm(false);
                    setReviews((prev) => [created, ...prev].slice(0, 3));
                    const refreshed = await fetchStudioProfile(studio.id);
                    if (refreshed.ok) {
                      setStudio(refreshed.provider);
                    }
                    setCanReviewBookingId(null);
                  }}
                />
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {reviews.length === 0 ? (
                <div className="text-sm text-text-muted">{UI_TEXT.publicStudio.reviewEmpty}</div>
              ) : (
                reviews.map((review) => (
                  <div key={review.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-text">{review.authorName}</div>
                      <div className="text-xs text-text-muted">{stars(review.rating)}</div>
                    </div>
                    {review.text ? <div className="mt-2 text-sm text-text-muted">{review.text}</div> : null}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title={UI_TEXT.publicStudio.servicesTitle} subtitle={UI_TEXT.publicStudio.servicesSubtitle}>
        <StudioServicesList
          studioId={studio.id}
          categories={studio.categories}
          services={studio.services}
        />
      </Section>

      <Section title={UI_TEXT.publicStudio.teamTitle} subtitle={UI_TEXT.publicStudio.teamSubtitle}>
        <StudioMastersCarousel studioId={studio.id} masters={masters} />
      </Section>

      <a
        href="#studio-booking-entry"
        className="fixed bottom-5 right-5 z-20 inline-flex items-center justify-center rounded-full bg-neutral-900 px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-neutral-800"
      >
        {UI_TEXT.publicStudio.heroBook}
      </a>
    </div>
  );
}
