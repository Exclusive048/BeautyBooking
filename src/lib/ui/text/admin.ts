/** Legacy admin namespace. Most sub-namespaces (`nav`, `catalog`, `users`,
 * `cities`, `reviews`, `dashboard`, `billing`, `settings`, `visualSearch`)
 * were removed in PHASE-7-CLEANUP-A together with their legacy
 * `src/features/admin/components/*` consumers. Active UI now lives under
 * `UI_TEXT.adminPanel.*`. Only `admin.media.*` survives because
 * `LoginHeroImageManager` and `SiteLogoManager` still reference it. */
export const admin = {
  media: {
    siteLogoTitle: "Логотип сайта",
    siteLogoDescription: "Используется в navbar рядом с МастерРядом.",
    loginHeroTitle: "Фото для страницы входа",
    loginHeroDescription: "Большое изображение в левой части страницы /login.",
    focalPoint: "Точка фокуса",
    uploadImage: "Загрузить изображение",
    replaceImage: "Заменить изображение",
    removeImage: "Удалить изображение",
    emptyImage: "Изображение не загружено",
    uploadFailed: "Не удалось загрузить изображение. Попробуйте ещё раз.",
    deleteFailed: "Не удалось удалить изображение. Попробуйте ещё раз.",
    loadFailed: "Не удалось загрузить настройки изображения. Попробуйте ещё раз.",
  },
} as const;
