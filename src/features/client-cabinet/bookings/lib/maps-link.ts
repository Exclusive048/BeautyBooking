export function buildYandexMapsLink(address: string): string {
  return `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`;
}
