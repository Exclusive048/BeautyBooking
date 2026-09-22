import { isVisualSearchEnabled } from "@/lib/env";

/** Значение тумблера админа, когда строки `SystemConfig` ещё нет. */
export const VISUAL_SEARCH_TOGGLE_DEFAULT = true;

/**
 * VISUAL-SEARCH-TOGGLE-01 — единственная формула «включён ли визуальный поиск».
 *
 * 🔴 Дефект. Рантайм (`config.ts`) при отсутствии строки `SystemConfig`
 * считал поиск ВКЛЮЧЁННЫМ, если заданы креды Яндекса, а админка (`flags.service`,
 * `system-config`) и `get-current-plan` для той же ситуации подставляли `false`.
 * Итог: камера в каталоге показана, платная индексация идёт на каждую загрузку,
 * а в админке тумблер «выключен», и нажатие «выключить» — no-op (PATCH пишет
 * строку, только если значение отличается от подставленного `false`). Вторая
 * половина: сохранённое `true` действовало и без кредов — поиск «включён», а
 * каждый вызов провайдера падал и пользователь видел «не поняли, что на фото».
 *
 * Правило теперь одно, той же формы, что у Telegram (`getTelegramEnabled`):
 * креды — потолок (нет кредов → выключен всегда), тумблер админа действует ниже
 * потолка и по умолчанию включён. Потребители — рантайм, админка и тарифный
 * снимок — зовут эту функцию, а не пишут свою.
 */
export function resolveVisualSearchEnabled(storedValue: unknown): boolean {
  if (!isVisualSearchEnabled) return false;
  return typeof storedValue === "boolean" ? storedValue : VISUAL_SEARCH_TOGGLE_DEFAULT;
}
