import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";

const slugFindUnique = vi.hoisted(() => vi.fn());
const slugCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversationSlug: {
      findUnique: slugFindUnique,
      create: slugCreate,
    },
  },
}));

import {
  generateConversationSlug,
  getOrCreateConversationSlug,
  resolveConversationSlug,
} from "@/lib/chat/conversation-slug";

const ALPHABET_REGEX = /^[a-zA-Z0-9]{10}$/;

function makeUniqueViolation(): Error {
  return new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed",
    { code: "P2002", clientVersion: "test" },
  );
}

describe("chat/conversation-slug", () => {
  beforeEach(() => {
    slugFindUnique.mockReset();
    slugCreate.mockReset();
  });

  describe("generateConversationSlug", () => {
    it("emits 10-char base62 strings", () => {
      for (let i = 0; i < 50; i += 1) {
        const slug = generateConversationSlug();
        expect(slug).toMatch(ALPHABET_REGEX);
      }
    });

    it("draws from the full alphabet over many samples (no severe bias)", () => {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i += 1) {
        seen.add(generateConversationSlug());
      }
      // 200 random 10-char base62 picks should never collide in practice
      expect(seen.size).toBe(200);
    });
  });

  describe("getOrCreateConversationSlug", () => {
    it("returns existing slug when the pair is already registered", async () => {
      slugFindUnique.mockResolvedValueOnce({ slug: "existingABC" });

      const result = await getOrCreateConversationSlug({
        providerId: "prov_1",
        clientUserId: "client_1",
      });

      expect(result).toBe("existingABC");
      expect(slugCreate).not.toHaveBeenCalled();
    });

    it("creates a new slug when the pair has none yet", async () => {
      slugFindUnique.mockResolvedValueOnce(null);
      slugCreate.mockResolvedValueOnce({ slug: "freshSlug1" });

      const result = await getOrCreateConversationSlug({
        providerId: "prov_2",
        clientUserId: "client_2",
      });

      expect(result).toBe("freshSlug1");
      expect(slugCreate).toHaveBeenCalledOnce();
    });

    it("recovers from P2002 by re-reading the pair (parallel-insert race)", async () => {
      slugFindUnique
        .mockResolvedValueOnce(null) // initial lookup — pair not yet present
        .mockResolvedValueOnce({ slug: "raceWinner" }); // post-P2002 re-read
      slugCreate.mockRejectedValueOnce(makeUniqueViolation());

      const result = await getOrCreateConversationSlug({
        providerId: "prov_3",
        clientUserId: "client_3",
      });

      expect(result).toBe("raceWinner");
      expect(slugCreate).toHaveBeenCalledOnce();
    });

    it("retries on slug-column collision and eventually succeeds", async () => {
      slugFindUnique
        .mockResolvedValueOnce(null) // initial lookup
        .mockResolvedValueOnce(null) // re-read after 1st P2002 (slug collision, not pair race)
        .mockResolvedValueOnce(null); // re-read after 2nd P2002
      slugCreate
        .mockRejectedValueOnce(makeUniqueViolation())
        .mockRejectedValueOnce(makeUniqueViolation())
        .mockResolvedValueOnce({ slug: "thirdTime" });

      const result = await getOrCreateConversationSlug({
        providerId: "prov_4",
        clientUserId: "client_4",
      });

      expect(result).toBe("thirdTime");
      expect(slugCreate).toHaveBeenCalledTimes(3);
    });

    it("rethrows non-P2002 errors immediately", async () => {
      slugFindUnique.mockResolvedValueOnce(null);
      slugCreate.mockRejectedValueOnce(new Error("connection lost"));

      await expect(
        getOrCreateConversationSlug({ providerId: "p", clientUserId: "c" }),
      ).rejects.toThrow("connection lost");
    });
  });

  describe("resolveConversationSlug", () => {
    it("returns the pair when the slug exists", async () => {
      slugFindUnique.mockResolvedValueOnce({
        providerId: "prov_5",
        clientUserId: "client_5",
      });

      const result = await resolveConversationSlug("validSlug1");

      expect(result).toEqual({ providerId: "prov_5", clientUserId: "client_5" });
    });

    it("returns null for unknown slugs", async () => {
      slugFindUnique.mockResolvedValueOnce(null);

      const result = await resolveConversationSlug("unknownABC");

      expect(result).toBeNull();
    });

    it("returns null without hitting the DB for malformed input", async () => {
      const result1 = await resolveConversationSlug("");
      const result2 = await resolveConversationSlug("tooShort");

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(slugFindUnique).not.toHaveBeenCalled();
    });
  });
});
