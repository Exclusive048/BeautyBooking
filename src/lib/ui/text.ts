/**
 * UI-тексты — ЕДИНСТВЕННЫЙ источник (CLAUDE.md, правило 1). Барель над доменами
 * `src/lib/ui/text/<домен>.ts`; строк здесь нет — новый ключ кладётся в файл
 * своего домена, новый домен — отдельным файлом и строкой ниже.
 *
 * Импорт — только пространством имён: `import * as UI_TEXT from "@/lib/ui/text"`.
 * Webpack отслеживает статический доступ `UI_TEXT.<домен>.…` и везёт в браузер
 * лишь те домены, к которым маршрут обращается (29.09 доработки · 18, PERF-02).
 * Доступ, который это отслеживание выключает (`UI_TEXT` как значение, `UI_TEXT[…]`,
 * передача целиком), ловит `src/lib/ui/text-client-graph.test.ts`.
 */
export { common } from "./text/common";
export { a11y } from "./text/a11y";
export { brand } from "./text/brand";
export { cookieNotice } from "./text/cookie-notice";
export { cities } from "./text/cities";
export { legal } from "./text/legal";
export { about } from "./text/about";
export { howItWorks } from "./text/how-it-works";
export { howToBook } from "./text/how-to-book";
export { becomeMaster } from "./text/become-master";
export { support } from "./text/support";
export { partners } from "./text/partners";
export { catalog2 } from "./text/catalog2";
export { pricing } from "./text/pricing";
export { help } from "./text/help";
export { careers } from "./text/careers";
export { models } from "./text/models";
export { faq } from "./text/faq";
export { meta } from "./text/meta";
export { actions } from "./text/actions";
export { status } from "./text/status";
export { moderation } from "./text/moderation";
export { welcome } from "./text/welcome";
export { auth } from "./text/auth";
export { nav } from "./text/nav";
export { social } from "./text/social";
export { footer } from "./text/footer";
export { pwa } from "./text/pwa";
export { network } from "./text/network";
export { ai } from "./text/ai";
export { deletion } from "./text/deletion";
export { notifications } from "./text/notifications";
export { billing } from "./text/billing";
export { schedule } from "./text/schedule";
export { cabinet } from "./text/cabinet";
export { settings } from "./text/settings";
export { studio } from "./text/studio";
export { cabinetHub } from "./text/cabinet-hub";
export { cabinetRoles } from "./text/cabinet-roles";
export { cabinetRolesPage } from "./text/cabinet-roles-page";
export { notificationsCenter } from "./text/notifications-center";
export { feed } from "./text/feed";
export { homeGuest } from "./text/home-guest";
export { homeFeed } from "./text/home-feed";
export { home } from "./text/home";
export { services } from "./text/services";
export { catalog } from "./text/catalog";
export { analytics } from "./text/analytics";
export { cabinetMaster } from "./text/cabinet-master";
export { master } from "./text/master";
export { adminPanel } from "./text/admin-panel";
export { admin } from "./text/admin";
export { media } from "./text/media";
export { phoneVerify } from "./text/phone-verify";
export { clientCabinet } from "./text/client-cabinet";
export { publicProfile } from "./text/public-profile";
export { studioCabinet } from "./text/studio-cabinet";
export { setupGuide } from "./text/setup-guide";
export { publicStudio } from "./text/public-studio";
export { guestManage } from "./text/guest-manage";
export { bookingWidget } from "./text/booking-widget";
export { pages } from "./text/pages";
export { chat } from "./text/chat";
export { errorPages } from "./text/error-pages";
export { reviews } from "./text/reviews";
