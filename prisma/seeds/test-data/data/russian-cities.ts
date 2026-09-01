/**
 * Города фикстурного сида.
 *
 * PWA-FIX-01: сами данные переехали в `prisma/seeds/reference/catalog-reference.ts`
 * — это продуктовый СПРАВОЧНИК, и его же сеет боевой провижининг
 * (`npm run seed:reference`). Здесь остался реэкспорт, чтобы фикстуры и прод
 * не разошлись двумя копиями координат и таймзон.
 */
import type { ReferenceCity } from "../../reference/catalog-reference";
import { REFERENCE_CITIES } from "../../reference/catalog-reference";

export type SeedCity = ReferenceCity;

export const RUSSIAN_CITIES: ReadonlyArray<SeedCity> = REFERENCE_CITIES;
