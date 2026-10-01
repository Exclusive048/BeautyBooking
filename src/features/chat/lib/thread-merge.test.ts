import { describe, expect, it } from "vitest";
import { mergeThreadItems } from "@/features/chat/lib/thread-merge";
import type { ThreadItemDto, ThreadMessageDto } from "@/features/chat/types";

/**
 * 29.09 доработки · 31 — склейка страниц переписки на клиенте: свежая страница
 * перезапрашивается на каждое новое сообщение и не должна ни терять уже
 * загруженные ранние страницы, ни дублировать разделитель дня на стыке.
 *
 * @probe 2026-10-01 — в `use-conversation-thread.ts` свежая страница снова
 * ЗАМЕНЯЕТ ленту (`detail` без `mergeThreadItems`): тест склейки здесь
 * остаётся зелёным — он про функцию, а не про её вызов. Замену ловит живая
 * спека `.qa/spec31-list-limits.spec.ts` («Показать раньше» → новое сообщение):
 * красный «toHaveCount — Expected: 130, Received: 99» (ранние 30 пропали).
 */

function msg(id: string, iso: string, readAt: string | null = null): ThreadMessageDto {
  return {
    type: "message",
    id,
    senderType: "CLIENT",
    senderName: "Клиент",
    body: id,
    readAt,
    createdAt: iso,
    bookingId: "b-1",
    bookingCard: null,
    attachmentUrl: null,
  };
}

const sep = (key: string): ThreadItemDto => ({ type: "day_separator", id: `day-${key}`, dateKey: key });

describe("mergeThreadItems", () => {
  it("ранняя страница + свежая: один разделитель на день, порядок по времени", () => {
    const older = [sep("2026-09-01"), msg("a", "2026-09-01T08:00:00.000Z"), msg("b", "2026-09-01T09:00:00.000Z")];
    const latest = [sep("2026-09-01"), msg("c", "2026-09-01T10:00:00.000Z"), sep("2026-09-02"), msg("d", "2026-09-02T08:00:00.000Z")];
    const merged = mergeThreadItems(latest, older, "Europe/Moscow");
    expect(merged.map((i) => i.id)).toEqual(["day-2026-09-01", "a", "b", "c", "day-2026-09-02", "d"]);
  });

  it("окно «последние 100» сдвинулось — загруженное раньше не теряется", () => {
    const loaded = [msg("a", "2026-09-01T08:00:00.000Z"), msg("b", "2026-09-01T09:00:00.000Z")];
    const freshWindow = [msg("b", "2026-09-01T09:00:00.000Z"), msg("c", "2026-09-01T10:00:00.000Z")];
    expect(mergeThreadItems(loaded, freshWindow, "UTC").filter((i) => i.type === "message").map((i) => i.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("повтор сообщения — побеждает более поздний ответ (свежий readAt)", () => {
    const merged = mergeThreadItems(
      [msg("a", "2026-09-01T08:00:00.000Z", null)],
      [msg("a", "2026-09-01T08:00:00.000Z", "2026-09-01T08:05:00.000Z")],
      "UTC",
    );
    expect(merged.find((i) => i.id === "a")).toMatchObject({ readAt: "2026-09-01T08:05:00.000Z" });
  });

  it("разделитель дня — по часам зрителя", () => {
    // 22:30 UTC 1 сентября — это уже 2 сентября в Москве.
    const merged = mergeThreadItems([], [msg("a", "2026-09-01T22:30:00.000Z")], "Europe/Moscow");
    expect(merged[0]).toEqual(sep("2026-09-02"));
  });
});
