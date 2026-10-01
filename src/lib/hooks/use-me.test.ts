import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SESSION-PWA-GUEST-FLASH — сбой чтения `/api/me` не превращает вошедшего в гостя.
 *
 * @probe 2026-10-01: вернуть в `meFetcher` прежнее `catch { return null }` →
 *        красный «сетевой сбой бросается» и «503 бросается».
 */

const fetchJsonWithAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/http/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http/client")>();
  return { ...actual, fetchJsonWithAuth };
});

import { ApiClientError } from "@/lib/http/client";
import { meFetcher } from "@/lib/hooks/use-me";

beforeEach(() => fetchJsonWithAuth.mockReset());

describe("meFetcher", () => {
  it("ответ сервера отдаётся как есть — и пользователь, и гость", async () => {
    fetchJsonWithAuth.mockResolvedValueOnce({ user: { id: "u1" } });
    await expect(meFetcher("/api/me")).resolves.toEqual({ user: { id: "u1" } });
    fetchJsonWithAuth.mockResolvedValueOnce({ user: null });
    await expect(meFetcher("/api/me")).resolves.toEqual({ user: null });
  });

  it("401 после неудачного обновления — гость", async () => {
    fetchJsonWithAuth.mockRejectedValueOnce(new ApiClientError({ message: "x", status: 401 }));
    await expect(meFetcher("/api/me")).resolves.toEqual({ user: null });
  });

  it("сетевой сбой бросается — SWR сохранит прежнего пользователя", async () => {
    fetchJsonWithAuth.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(meFetcher("/api/me")).rejects.toThrow("Failed to fetch");
  });

  it("503 «идут работы» бросается", async () => {
    fetchJsonWithAuth.mockRejectedValueOnce(new ApiClientError({ message: "x", status: 503 }));
    await expect(meFetcher("/api/me")).rejects.toBeInstanceOf(ApiClientError);
  });
});
