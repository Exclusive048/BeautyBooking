type BuildYandexMapsUrlInput = {
  address?: string | null;
  lat?: number | null;
  lon?: number | null;
  zoom?: number;
};

function isFiniteCoordinate(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function buildYandexMapsUrl(input: BuildYandexMapsUrlInput): string | null {
  const zoom = Number.isInteger(input.zoom) ? input.zoom : 16;
  if (isFiniteCoordinate(input.lat) && isFiniteCoordinate(input.lon)) {
    const ll = `${input.lon},${input.lat}`;
    return `https://yandex.ru/maps/?ll=${encodeURIComponent(ll)}&z=${zoom}&pt=${encodeURIComponent(`${ll},pm2rdm`)}`;
  }

  const address = input.address?.trim() ?? "";
  if (!address) return null;
  return `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`;
}
