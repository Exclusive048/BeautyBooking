"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { moneyRUB, minutesToHuman } from "@/lib/format";
import type { MediaAssetDto } from "@/lib/media/types";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { ReviewDto } from "@/lib/reviews/types";
import type { ApiResponse } from "@/lib/types/api";
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
  const router = useRouter();

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
          throw new Error("Profile is only available for studios");
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
        setError(e instanceof Error ? e.message : "Failed to load studio");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [studioId]);

  const subtitle = useMemo(() => {
    if (!studio) return "";
    return studio.tagline?.trim() ? studio.tagline : "Studio description is not set yet.";
  }, [studio]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-text">Loading studio profile...</div>
        </CardContent>
      </Card>
    );
  }

  if (error || !studio) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-text">Failed to open profile</div>
          <div className="mt-2 text-sm text-text-muted">{error ?? "Studio not found"}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <Section
        title={studio.name}
        subtitle={subtitle}
        right={
          <Button asChild>
            <Link href={`/studios/${studio.id}/booking`}>Open booking</Link>
          </Button>
        }
      />

      <Card className="bg-surface">
        <CardContent className="p-5 md:p-6 space-y-4">
          {studio.avatarUrl ? (
            <img src={studio.avatarUrl} alt="" className="h-20 w-20 rounded-2xl object-cover" />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Studio</Badge>
            {studio.availableToday ? <Badge>Available today</Badge> : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-text-muted">
              <span className="font-semibold text-text">{studio.rating.toFixed(1)}</span>{" "}
              <span>({studio.reviews} reviews)</span>
            </div>
            <div className="text-sm text-text">
              from <span className="font-semibold">{moneyRUB(studio.priceFrom)}</span>
            </div>
          </div>
          <div className="text-sm text-text-muted">
            {studio.district} / {studio.address}
          </div>
          <div className="flex flex-wrap gap-2">
            {studio.categories.length ? (
              studio.categories.map((c) => <Badge key={c}>{c}</Badge>)
            ) : (
              <Badge>No categories</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Section title="Studio photos" subtitle="Interior, team and atmosphere.">
        <Card className="bg-surface">
          <CardContent className="p-5 md:p-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {portfolio.length > 0
                ? portfolio.map((asset) => (
                    <div key={asset.id} className="aspect-square rounded-2xl bg-muted border border-border overflow-hidden">
                      <img src={asset.url} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))
                : Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-2xl bg-muted border border-border" />
                  ))}
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Reviews" subtitle="Latest client reviews.">
        <Card className="bg-surface">
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-text-muted">
                {stars(studio.rating)} / {studio.reviews} reviews
              </div>
              {canReviewBookingId && !showReviewForm ? (
                <button
                  type="button"
                  onClick={() => setShowReviewForm(true)}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50"
                >
                  Leave review
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
                <div className="text-sm text-text-muted">No reviews yet.</div>
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

      <Section title="Studio services" subtitle="Services list without slot selection.">
        {studio.services.length === 0 ? (
          <Card className="bg-surface">
            <CardContent className="p-6 text-sm text-text-muted">
              No services yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {studio.services.map((service) => (
              <Card key={service.id} className="bg-surface">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-text">{service.name}</div>
                      <div className="mt-1 text-xs text-text-muted">
                        {minutesToHuman(service.durationMin)}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-text">
                      {service.price > 0 ? moneyRUB(service.price) : "Price on request"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title="Studio masters" subtitle="Pick a master and continue to booking.">
        {masters.length === 0 ? (
          <Card className="bg-surface">
            <CardContent className="p-6 text-sm text-text-muted">
              No available masters yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {masters.map((master) => (
              <Card
                key={master.id}
                className="bg-surface cursor-pointer transition hover:border-text/60"
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/providers/${master.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/providers/${master.id}`);
                  }
                }}
              >
                <CardContent className="p-5 md:p-6 flex flex-wrap items-center gap-4 justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-12 w-12 rounded-2xl bg-muted border border-border" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text truncate">{master.name}</div>
                      <div className="text-xs text-text-muted">Studio master</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" asChild>
                      <Link
                        href={`/studios/${studio.id}/booking?masterId=${master.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Book
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
