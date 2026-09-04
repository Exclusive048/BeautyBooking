/**
 * FIX-OFFER-REQUIREMENTS — правила набора списка «Условия» у предложения
 * для модели.
 *
 * 🔴 Дефект, ради которого модуль появился: условие попадало в состояние
 * формы ТОЛЬКО по нажатию Enter. Мастер печатал «натуральные ногти», жал
 * «Создать предложение» — и текст исчезал вместе с модалкой: он жил в
 * локальном стейте поля ввода и наружу не выходил никогда. Ни ошибки, ни
 * следа; со стороны это читается как «условия не сохраняются». Сервер и
 * карточка предложения были ни при чём — оба работали, им просто приходил
 * пустой массив.
 *
 * Поэтому правило добавления живёт здесь, а не внутри поля: его зовут ОБА
 * пути — коммит чипа (Enter / потеря фокуса) и отправка формы, дописывающая
 * недобранный черновик. Одна функция ⇒ trim, дедуп и потолок не могут
 * разъехаться между этими путями.
 */

/** Потолок дублирует серверную схему (`model-offers/schemas.ts`). */
export const MAX_REQUIREMENTS = 5;

/**
 * Дописать условие к списку. Возвращает ИСХОДНЫЙ массив, если добавлять
 * нечего — пустая строка, дубль (без учёта регистра) или список уже полон.
 * Ссылочное равенство в этом случае намеренное: вызывающий может сравнить
 * результат и понять, приняли ли ввод.
 */
export function appendRequirement(list: readonly string[], raw: string): string[] {
  const value = raw.trim();
  if (!value) return list as string[];
  if (list.length >= MAX_REQUIREMENTS) return list as string[];
  const lower = value.toLowerCase();
  if (list.some((item) => item.trim().toLowerCase() === lower)) return list as string[];
  return [...list, value];
}

/**
 * Итоговый список условий для отправки на сервер: чипы плюс недобранный
 * черновик. Единственная точка, которую зовут ОБЕ модалки — иначе «а тут я
 * отправлю просто `state.requirements`» вернёт исходный дефект в новом файле.
 * Сторож полноты — `requirements.test.ts`.
 */
export function resolveRequirementsForSubmit(state: {
  requirements: readonly string[];
  requirementsDraft: string;
}): string[] {
  return appendRequirement(state.requirements, state.requirementsDraft);
}

/**
 * Перевести черновик в чип — ОДНИМ переходом состояния.
 *
 * 🔴 Почему это функция, а не два вызова обновления поля: форма обновляется
 * как `onChange({ ...state, [key]: value })`, то есть каждый вызов строится от
 * ОДНОГО И ТОГО ЖЕ снимка `state`. Записать сначала список, потом пустой
 * черновик — значит вторым вызовом восстановить список из устаревшего снимка
 * и потерять только что добавленный чип. Ровно этот дефект и был допущен при
 * первой версии фикса; пин — «коммит черновика атомарен» в
 * `requirements.test.ts`.
 */
export function commitRequirementDraft<
  T extends { requirements: string[]; requirementsDraft: string },
>(state: T): T {
  return {
    ...state,
    requirements: appendRequirement(state.requirements, state.requirementsDraft),
    requirementsDraft: "",
  };
}
