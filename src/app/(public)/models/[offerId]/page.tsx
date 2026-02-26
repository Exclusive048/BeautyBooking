import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getPublicModelOffer } from "@/lib/model-offers/public.service";
import { ModelOfferApplyForm } from "@/features/model-offers/components/public-model-offer-apply";
import { FocalImage } from "@/components/ui/focal-image";

type PageProps = {
  params: Promise<{ offerId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { offerId } = await params;
  const offer = await getPublicModelOffer(offerId);
  if (!offer) {
    return {
      title: "Предложение не найдено | BeautyHub",
      description: "Предложение для моделей недоступно или было закрыто.",
    };
  }

  return {
    title: `${offer.service.title} для моделей | BeautyHub`,
    description: `Предложение от мастера ${offer.master.name}: ${offer.dateLocal} ${offer.timeRangeStartLocal}-${offer.timeRangeEndLocal}.`,
  };
}

export default async function ModelOfferPage({ params }: PageProps) {
  const { offerId } = await params;
  const offer = await getPublicModelOffer(offerId);
  if (!offer) return notFound();

  const user = await getSessionUser();
  const loginHref = `/login?next=${encodeURIComponent(`/models/${offer.id}`)}`;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-16 pt-10">
      <div className="mb-6">
        <Link href="/models" className="text-sm text-text-sec hover:text-text-main">
          ← Все предложения
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-border-subtle/80 bg-bg-card/80 p-6">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 overflow-hidden rounded-2xl border border-border-subtle/80 bg-bg-input">
              {offer.master.avatarUrl ? (
                <FocalImage
                  src={offer.master.avatarUrl}
                  alt=""
                  focalX={offer.master.avatarFocalX}
                  focalY={offer.master.avatarFocalY}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-base font-semibold text-text-sec">
                  {offer.master.name.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <div className="text-sm text-text-sec">Мастер</div>
              <div className="text-lg font-semibold text-text-main">{offer.master.name}</div>
              <div className="text-xs text-text-sec">
                {offer.master.city ?? "Город не указан"} • ⭐ {offer.master.ratingAvg.toFixed(1)}
              </div>
            </div>
          </div>

          {offer.master.publicUsername ? (
            <Link
              href={`/u/${offer.master.publicUsername}`}
              className="mt-4 inline-flex text-sm font-medium text-primary hover:opacity-80"
            >
              Перейти в профиль мастера
            </Link>
          ) : null}

          <div className="mt-6 border-t border-border-subtle/80 pt-6">
            <div className="text-xs uppercase tracking-wide text-text-sec">
              {offer.service.category?.title ?? "Категория не указана"}
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-text-main">{offer.service.title}</h1>
            {offer.service.description ? (
              <p className="mt-3 text-sm text-text-sec">{offer.service.description}</p>
            ) : null}

            <div className="mt-6 grid gap-3 rounded-2xl bg-bg-input/60 p-4 text-sm text-text-main">
              <div className="flex items-center justify-between">
                <span>Дата и время</span>
                <span>
                  {offer.dateLocal} • {offer.timeRangeStartLocal}-{offer.timeRangeEndLocal}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Длительность</span>
                <span>{offer.service.durationMin} мин</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Стоимость</span>
                <span>{offer.price !== null ? `${offer.price} ₸` : "Бесплатно"}</span>
              </div>
            </div>

            <div className="mt-6">
              <div className="text-sm font-semibold text-text-main">Требования</div>
              {offer.requirements.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-sec">
                  {offer.requirements.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-text-sec">Нет дополнительных требований.</p>
              )}
            </div>
          </div>
        </div>

        <aside className="rounded-3xl border border-border-subtle/80 bg-bg-card/80 p-6">
          <div className="text-sm font-semibold text-text-main">Отклик на предложение</div>
          <p className="mt-2 text-sm text-text-sec">
            Загрузите 1–3 фото и коротко расскажите о себе. Мастер увидит вашу заявку в кабинете.
          </p>
          <div className="mt-5">
            <ModelOfferApplyForm offerId={offer.id} userId={user?.id ?? null} loginHref={loginHref} />
          </div>
        </aside>
      </div>
    </section>
  );
}
