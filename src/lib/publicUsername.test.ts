import test from "node:test";
import assert from "node:assert/strict";
import { ProviderType } from "@prisma/client";
import { ensureUniqueUsername, resolvePublicUsername, validateUsername } from "@/lib/publicUsername";

test("validateUsername accepts valid usernames", () => {
  assert.equal(validateUsername("anna-beauty").ok, true);
  assert.equal(validateUsername("studio24").ok, true);
  assert.equal(validateUsername("master-123").ok, true);
});

test("validateUsername rejects invalid usernames", () => {
  assert.equal(validateUsername("ab").ok, false);
  assert.equal(validateUsername("a--b").ok, false);
  assert.equal(validateUsername("-master").ok, false);
  assert.equal(validateUsername("master-").ok, false);
  assert.equal(validateUsername("ADMIN").ok, false);
  assert.equal(validateUsername("admin").ok, false);
  assert.equal(validateUsername("12345").ok, false);
});

test("validateUsername rejects reserved slugs", () => {
  assert.equal(validateUsername("booking").ok, false);
  assert.equal(validateUsername("cabinet").ok, false);
});

test("ensureUniqueUsername appends suffix when taken", async () => {
  const taken = new Set(["anna-beauty", "anna-beauty-2"]);
  const prismaMock = {
    provider: {
      findUnique: async ({ where }: { where: { publicUsername: string } }) =>
        taken.has(where.publicUsername) ? { id: "p1" } : null,
    },
    userProfile: {
      findUnique: async ({ where }: { where: { publicUsername: string } }) =>
        taken.has(where.publicUsername) ? { id: "u1" } : null,
    },
    publicUsernameAlias: {
      findUnique: async ({ where }: { where: { username: string } }) =>
        taken.has(where.username) ? { id: "a1" } : null,
    },
  };

  const result = await ensureUniqueUsername(prismaMock as never, "anna-beauty");
  assert.equal(result, "anna-beauty-3");
});

test("resolvePublicUsername redirects from alias to current username", async () => {
  const result = await resolvePublicUsername(
    {
      findProviderByUsernameOrAlias: async () => ({
        id: "provider-1",
        publicUsername: "new-name",
        isPublished: true,
        type: ProviderType.STUDIO,
      }),
    },
    "old-name"
  );

  assert.deepEqual(result, { status: "redirect", username: "new-name" });
});

test("resolvePublicUsername returns provider for published username", async () => {
  const result = await resolvePublicUsername(
    {
      findProviderByUsernameOrAlias: async () => ({
        id: "provider-2",
        publicUsername: "master",
        isPublished: true,
        type: ProviderType.MASTER,
      }),
    },
    "master"
  );

  assert.deepEqual(result, { status: "found", providerId: "provider-2", providerType: ProviderType.MASTER });
});
