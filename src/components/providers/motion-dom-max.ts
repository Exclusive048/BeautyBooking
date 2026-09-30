/**
 * Полный набор возможностей framer-motion (`layout` / `layoutId` / `drag`) —
 * отдельным чанком (29.09 доработки · 19). Грузится асинхронно вложенным
 * `<LazyMotion features={loadDomMax}>` только там, где нужна layout-анимация;
 * в шелл каждой страницы не попадает. Реестр потребителей —
 * `src/lib/ui/motion-imports.test.ts`.
 */
export { domMax as default } from "framer-motion";
