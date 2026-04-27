export type CatalogMapPoint = {
  id: string;
  title: string;
  type: "master" | "studio";
  avatarUrl: string | null;
  ratingAvg: number;
  priceFrom: number | null;
  publicUsername: string | null;
  geoLat: number;
  geoLng: number;
};
