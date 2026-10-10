/**
 * FIX-C5 — `stripComments`: убрать комментарии, НЕ убрав код.
 *
 * Реализация и её обоснование живут в `scripts/lib/strip-comments.mjs`
 * (GATE-COMMENT-BLINDNESS, 2026-10-10): тем же сканером пользуются гейты
 * `scripts/check-*.mjs`, которые TypeScript не импортируют, и вторая копия
 * разошлась бы с первой. Здесь — точка входа для сторожей (`@/lib/testing/…`).
 */
export { stripComments } from "../../../scripts/lib/strip-comments.mjs";
