import { describe, expect, it } from "vitest";

import type { ResilientImage } from "./resilient-image";

/**
 * RESILIENT-IMAGE-FILL-SIZES (PERF-15) — у fill-режима `ResilientImage` нет
 * молчаливого `sizes="100vw"`.
 *
 * Fill-ветка подставляла `sizes ?? "100vw"`: новый вызов, забывший `sizes`,
 * просил у оптимизатора картинку шириной во весь экран для плитки на треть
 * экрана — и это не роняло ни сборку, ни тест, ни глаз. Теперь режим размера —
 * дискриминированное объединение (`ResilientImageSizing`): `width` + `height`
 * (fixed-size, `sizes` по умолчанию из `width`) либо `sizes` обязателен.
 *
 * `@ts-expect-error` — утверждение компилятора: строка ОБЯЗАНА быть ошибочной.
 * Вернут `sizes` в необязательные — ошибка исчезнет, директива станет
 * «unused», и красным будет `npm run typecheck`.
 *
 * @probe 2026-10-10: в `resilient-image.tsx` второй вариант объединения
 *        возвращён к `sizes?: string` → `npm run typecheck`:
 *        «resilient-image-sizing.test.ts: error TS2578: Unused
 *        '@ts-expect-error' directive.» — строка «fill без `sizes`». Вторая
 *        строка при этом остаётся ошибочной: «ширина без высоты» отсекает не
 *        `sizes`, а `height` первого варианта. Восстановлено.
 */
type Props = Parameters<typeof ResilientImage>[0];

describe("RESILIENT-IMAGE-FILL-SIZES · режим размера задаётся типом", () => {
  it("fill без `sizes` не компилируется; явный `100vw` и fixed-size — компилируются", () => {
    // @ts-expect-error fill-режим: `sizes` обязателен, дефолта `100vw` нет
    const fillWithoutSizes: Props = { src: "/a.jpg", alt: "" };
    // @ts-expect-error ширина без высоты — это не fixed-size, а fill без `sizes`
    const widthOnly: Props = { src: "/a.jpg", alt: "", width: 40 };

    const fillExplicit: Props = { src: "/a.jpg", alt: "", sizes: "100vw" };
    const fixedSize: Props = { src: "/a.jpg", alt: "", width: 40, height: 40 };

    // Предмет проверки — сами присваивания выше; значения нужны только чтобы
    // переменные не считались неиспользуемыми.
    expect([fillWithoutSizes, widthOnly, fillExplicit, fixedSize]).toHaveLength(4);
  });
});
