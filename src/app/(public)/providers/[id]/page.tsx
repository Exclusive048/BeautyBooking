"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HeroBlock } from "@/features/public-profile/master/hero-block";
import { PortfolioStrip } from "@/features/public-profile/master/portfolio-strip";
import { ReviewsPreview } from "@/features/public-profile/master/reviews-preview";
import { ServicesMenu } from "@/features/public-profile/master/services-menu";
import { PublicBookingWidget } from "@/features/public-profile/master/public-booking-widget";
import type { ProviderProfileDto, ProviderServiceDto } from "@/lib/providers/dto";
import type { ReviewDto } from "@/lib/reviews/types";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type ClientBooking = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  provider: { id: string };
};

type PortfolioItemPreview = {
  id: string;
  mediaUrl: string;
  caption: string | null;
  primaryServiceTitle: string | null;
  masterName: string;
};

export default function ProviderProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();

  const [provider, setProvider] = useState<ProviderProfileDto | null>(null);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItemPreview[]>([]);
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [selectedServices, setSelectedServices] = useState<ProviderServiceDto[]>([]);
  const [canReviewBookingId, setCanReviewBookingId] = useState<string | null>(null);
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
          throw new Error(json && !json.ok ? json.error.message : UI_TEXT.publicProfile.page.loadFailedTitle);
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

        if (loaded?.type === "MASTER") {
          const [portfolioRes, reviewsRes] = await Promise.all([
            fetch(`/api/feed/portfolio?masterId=${encodeURIComponent(loaded.id)}&limit=8`, { cache: "no-store" }),
            fetch(
              `/api/reviews?targetType=provider&targetId=${encodeURIComponent(loaded.id)}&limit=3&offset=0`,
              { cache: "no-store" }
            ),
          ]);

          const portfolioJson = (await portfolioRes.json().catch(() => null)) as ApiResponse<{
            items: PortfolioItemPreview[];
          }> | null;
          if (alive && portfolioRes.ok && portfolioJson && portfolioJson.ok) {
            setPortfolioItems(portfolioJson.data.items);
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
        if (alive) setError(e instanceof Error ? e.message : UI_TEXT.publicProfile.page.unknownError);
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
            <div className="text-sm font-semibold text-text-main">{UI_TEXT.publicProfile.page.loading}</div>
          </CardContent>
        </Card>
      );
  }

  if (redirecting) {
      return (
        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-semibold text-text-main">{UI_TEXT.publicProfile.page.redirecting}</div>
          </CardContent>
        </Card>
      );
  }

  if (error || !provider) {
      return (
        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-semibold text-text-main">{UI_TEXT.publicProfile.page.loadFailedTitle}</div>
            <div className="mt-2 text-sm text-text-sec">{error ?? UI_TEXT.publicProfile.page.notFound}</div>
          </CardContent>
        </Card>
      );
  }

  const studioBookingHref =
    provider.type === "MASTER" && provider.studioId
      ? `/studios/${provider.studioId}/booking?masterId=${encodeURIComponent(provider.id)}${
          selectedServices[0] ? `&serviceId=${encodeURIComponent(selectedServices[0].id)}` : ""
        }`
      : null;

  return (
    <div className="space-y-6">
      <HeroBlock
        provider={provider}
        coverUrl={portfolioItems[0]?.mediaUrl ?? null}
        specialization={provider.tagline.trim() ? provider.tagline : null}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <ServicesMenu
            services={provider.services}
            selectedServiceIds={selectedServices.map((service) => service.id)}
            onAdd={(service) =>
              setSelectedServices((prev) => (prev.some((item) => item.id === service.id) ? prev : [...prev, service]))
            }
          />

          <Card>
            <CardContent className="p-5 md:p-6">
              <div className="text-sm font-semibold text-text-main">{UI_TEXT.publicProfile.page.categoriesTitle}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {provider.categories.map((category) => (
                  <Badge key={category}>{category}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <PortfolioStrip items={portfolioItems} />

          <ReviewsPreview
            providerId={provider.id}
            rating={provider.rating}
            reviewsCount={provider.reviews}
            initialReviews={reviews}
            canReviewBookingId={canReviewBookingId}
            onRatingRefresh={async () => {
              const res = await fetch(`/api/providers/${provider.id}`, { cache: "no-store" });
              const json = (await res.json().catch(() => null)) as ApiResponse<{
                provider: ProviderProfileDto | null;
              }> | null;
              if (res.ok && json && json.ok && json.data.provider) {
                setProvider(json.data.provider);
                setCanReviewBookingId(null);
              }
            }}
          />
        </div>

        <div className="h-fit lg:sticky lg:top-6 lg:max-h-[calc(100dvh-7rem)] lg:overflow-auto">
          {studioBookingHref ? (
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="text-sm font-semibold text-text-main">{UI_TEXT.publicProfile.page.studioBookingTitle}</div>
                <div className="text-sm text-text-sec">{UI_TEXT.publicProfile.page.studioBookingDescription}</div>
                <Link
                  href={studioBookingHref}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-4 py-2 text-sm font-medium text-[rgb(var(--accent-foreground))] shadow-card transition hover:shadow-hover"
                >
                  {UI_TEXT.publicProfile.page.studioBookingCta}
                </Link>
              </CardContent>
            </Card>
          ) : (
            <PublicBookingWidget
              providerId={provider.id}
              selectedServices={selectedServices}
              onRemove={(serviceId) =>
                setSelectedServices((prev) => prev.filter((service) => service.id !== serviceId))
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
