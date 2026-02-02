"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Section } from "@/components/ui/section";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import BookingWidget from "@/features/booking/components/booking-widget";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { moneyRUB } from "@/lib/format";
import type { MediaAssetDto } from "@/lib/media/types";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { ReviewDto } from "@/lib/reviews/types";
import type { ApiResponse } from "@/lib/types/api";

type ClientBooking = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  provider: { id: string };
};

function stars(value: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return "*".repeat(rounded) + "-".repeat(5 - rounded);
}

export default function ProviderProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();

  const [provider, setProvider] = useState<ProviderProfileDto | null>(null);
  const [masters, setMasters] = useState<Array<{ id: string; name: string }>>([]);
  const [portfolio, setPortfolio] = useState<MediaAssetDto[]>([]);
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [canReviewBookingId, setCanReviewBookingId] = useState<string | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/providers/${id}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ provider: ProviderProfileDto | null }> | null;

        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }

        const loaded = json.data.provider;
        if (loaded?.type === "STUDIO") {
          if (alive) {
            setRedirecting(true);
            router.replace(`/studios/${loaded.id}`);
          }
          return;
        }

        if (!alive) return;
        setProvider(loaded);
        setMasters([]);

        if (loaded?.type === "MASTER") {
          const [mediaRes, reviewsRes] = await Promise.all([
            fetch(
              `/api/media?entityType=MASTER&entityId=${encodeURIComponent(loaded.id)}&kind=PORTFOLIO`,
              { cache: "no-store" }
            ),
            fetch(
              `/api/reviews?targetType=provider&targetId=${encodeURIComponent(loaded.id)}&limit=3&offset=0`,
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
            const ownBookings = bookingsJson.data.bookings.filter((booking) => booking.provider.id === loaded.id);
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
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, router]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-neutral-900">Loading profile...</div>
        </CardContent>
      </Card>
    );
  }

  if (redirecting) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-neutral-900">Redirecting...</div>
        </CardContent>
      </Card>
    );
  }

  if (error || !provider) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-neutral-900">Failed to open profile</div>
          <div className="mt-2 text-sm text-neutral-600">{error ?? "Not found"}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Section
        title={provider.name}
        subtitle={provider.tagline}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{provider.type === "MASTER" ? "Master" : "Studio"}</Badge>
            {provider.availableToday ? <Badge>Available today</Badge> : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Card className="bg-white">
            <CardContent className="p-5 md:p-6">
              <div className="flex items-center gap-4">
                {provider.avatarUrl ? (
                  <img src={provider.avatarUrl} alt="" className="h-20 w-20 rounded-2xl object-cover" />
                ) : (
                  <div className="h-20 w-20 rounded-2xl bg-neutral-100 border border-neutral-200" />
                )}
                <div className="text-sm text-neutral-700">
                  <span className="font-semibold text-neutral-900">{provider.rating.toFixed(1)}</span>{" "}
                  <span className="text-neutral-500">({provider.reviews} reviews)</span>
                </div>
                <div className="text-sm text-neutral-900">
                  from <span className="font-semibold">{moneyRUB(provider.priceFrom)}</span>
                </div>
              </div>

              <div className="mt-3 text-sm text-neutral-600">
                {provider.district} / {provider.address}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {provider.categories.map((c) => (
                  <Badge key={c}>{c}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-5 md:p-6">
              <div className="text-sm font-semibold text-neutral-900">Portfolio</div>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                {portfolio.length > 0
                  ? portfolio.map((asset) => (
                      <div key={asset.id} className="aspect-square rounded-2xl bg-neutral-100 border border-neutral-200 overflow-hidden">
                        <img src={asset.url} alt="" className="h-full w-full object-cover" />
                      </div>
                    ))
                  : Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="aspect-square rounded-2xl bg-neutral-100 border border-neutral-200" />
                    ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-5 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">Reviews</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {stars(provider.rating)} / {provider.reviews} reviews
                  </div>
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
                      const res = await fetch(`/api/providers/${provider.id}`, { cache: "no-store" });
                      const json = (await res.json().catch(() => null)) as ApiResponse<{ provider: ProviderProfileDto | null }> | null;
                      if (res.ok && json && json.ok && json.data.provider) {
                        setProvider(json.data.provider);
                      }
                      setCanReviewBookingId(null);
                    }}
                  />
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                {reviews.length === 0 ? (
                  <div className="text-sm text-neutral-500">No reviews yet.</div>
                ) : (
                  reviews.map((review) => (
                    <div key={review.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">{review.authorName}</div>
                        <div className="text-xs text-neutral-500">{stars(review.rating)}</div>
                      </div>
                      {review.text ? (
                        <div className="mt-2 text-sm text-neutral-700">{review.text}</div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:sticky lg:top-24 h-fit">
          <BookingWidget
            providerId={provider.id}
            providerType={provider.type}
            services={provider.services}
            masters={masters}
          />
        </div>
      </div>
    </div>
  );
}
