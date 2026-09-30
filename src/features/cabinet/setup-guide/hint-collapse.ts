/**
 * SETUP-GUIDE-01 — свёрнута ли подсказка шага в строку.
 *
 * Выбор человека помнится для пары «шаг + выполнен ли» (`key`): новый шаг и
 * выполненный шаг снова показывают подсказку целиком. На узком экране над
 * закреплённой снизу панелью (`lifted`, «Сохранить» профиля студии) подсказка
 * сворачивается сама — вместе с панелью и нижней навигацией она заняла бы
 * полэкрана, — пока человек её не развернул; выполненный шаг не сворачивается:
 * на нём кнопка «Дальше».
 */
export function isHintCollapsed(input: {
  key: string;
  collapsedKey: string | null;
  expandedKey: string | null;
  narrow: boolean;
  lifted: boolean;
  done: boolean;
}): boolean {
  if (input.collapsedKey === input.key) return true;
  const autoCollapsed = input.narrow && input.lifted && !input.done;
  return autoCollapsed && input.expandedKey !== input.key;
}

/** Ключ выбора «свернуть / развернуть»: шаг и выполнен ли он. */
export function hintCollapseKey(stepId: string, done: boolean): string {
  return `${stepId}:${done ? "done" : "open"}`;
}
