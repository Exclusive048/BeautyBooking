import { z } from "zod";

import type { ConsentFlags } from "@/lib/legal/consent-flags";

/**
 * PERF-03 — Zod-половина контракта согласий, отделённая от клиентской.
 *
 * Форма одна и та же (RKN-FIX-01, инв. #37), но потребители разные: схему
 * зовут четыре серверных модуля валидации, а тип и предикаты — восемь
 * клиентских компонентов (форма логина и все booking-визарды). Пока и то и
 * другое лежало в одном файле, `zod` (523.9 kB) попадал в браузерный бандл
 * транзитивно — то есть валидатор, чья работа целиком серверная, ехал
 * анониму на публичном профиле.
 *
 * Проверка «схема и тип не разошлись» — отдельным `satisfies` ниже, а не
 * аннотацией переменной: аннотация стёрла бы конкретный тип `ZodObject` и
 * сломала бы `.optional()`, которым схему оборачивают все пять потребителей.
 * Раньше связь держал `z.infer` и разойтись они не могли физически; теперь это
 * обязанность проверки.
 */
export const consentFlagsSchema = z.object({
  /** Пользовательское соглашение (оферта) → ConsentType.TERMS */
  terms: z.boolean(),
  /** Согласие на обработку ПДн → ConsentType.PD_PROCESSING */
  pdProcessing: z.boolean(),
  /** Согласие на маркетинговые коммуникации → ConsentType.MARKETING (optional) */
  marketing: z.boolean().default(false),
});

/**
 * Выход схемы обязан совпадать с `ConsentFlags` (вход отличается намеренно: у
 * `marketing` есть `.default(false)`, поэтому в теле запроса поле
 * необязательно, а на выходе оно всегда есть).
 */
type SchemaOutput = z.infer<typeof consentFlagsSchema>;
// в обе стороны: пропущенное поле ловит первая строка, лишнее — вторая
const _schemaCoversType: ConsentFlags = undefined as unknown as SchemaOutput;
const _typeCoversSchema: SchemaOutput = undefined as unknown as ConsentFlags;
void _schemaCoversType;
void _typeCoversSchema;
