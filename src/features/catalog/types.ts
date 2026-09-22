export type CatalogMapPoint = {
  id: string;
  title: string;
  type: "master" | "studio";
  avatarUrl: string | null;
  /** Первое фото портфолио — превью карточки в полосе под картой. */
  photoUrl: string | null;
  /** Специализация / услуга — вторая строка карточки под картой. */
  subtitle: string | null;
  ratingAvg: number;
  reviewsCount: number;
  priceFrom: number | null;
  publicUsername: string | null;
  geoLat: number;
  geoLng: number;
};
