/**
 * UX-PASS-01 — место всплывающего меню у кнопки, в границах экрана.
 *
 * Вынесено из плитки портфолио (`portfolio-card.tsx`), где правило родилось:
 * меню, стоящее порталом с `position: fixed`, обязано (1) не уезжать за левый
 * и правый край, (2) у нижнего края открываться ВВЕРХ — иначе нижняя строка
 * списка (услуги, пакеты, записи в сетке расписания) открывала меню под
 * нижнюю навигацию телефона или за край экрана.
 *
 * Нижняя навигация телефона закрывает низ экрана: её высоту публикует
 * `BottomTabBar` переменной `--bottom-nav-h` (на ПК — 0).
 */

/** Отступ меню от края экрана. */
export const MENU_EDGE_PX = 8;

export type MenuPosition = { top: number; left: number };

function bottomNavHeight(): number {
  return (
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bottom-nav-h")) || 0
  );
}

/**
 * Верх меню высотой `menuHeight`: под кнопкой, если помещается над нижней
 * навигацией, иначе над кнопкой (не выше края экрана).
 */
export function menuTopNearAnchor(anchor: DOMRect, menuHeight: number, gap = 4): number {
  const below = anchor.bottom + gap;
  const fitsBelow = below + menuHeight <= window.innerHeight - bottomNavHeight() - MENU_EDGE_PX;
  return fitsBelow ? below : Math.max(MENU_EDGE_PX, anchor.top - menuHeight - gap);
}

/**
 * Меню, выровненное по правому краю кнопки: прижато к краям экрана по
 * горизонтали и открывается вверх, если внизу не помещается.
 */
export function placeMenu(anchor: DOMRect, menu: { width: number; height: number }, gap = 4): MenuPosition {
  const viewportWidth = document.documentElement.clientWidth;
  const left = Math.max(
    MENU_EDGE_PX,
    Math.min(anchor.right - menu.width, viewportWidth - menu.width - MENU_EDGE_PX),
  );
  return { left, top: menuTopNearAnchor(anchor, menu.height, gap) };
}
