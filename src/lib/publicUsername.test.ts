import {
  ensureUniqueUsername,
  generateDefaultUsername,
  normalizeUsernameInput,
  resolvePublicClientUsername,
  resolvePublicUsername,
  slugifyUsername,
  validateUsername,
} from "@/lib/publicUsername";

describe("publicUsername", () => {
  it("normalizes and slugifies input", () => {
    expect(normalizeUsernameInput("  Anna  ")).toBe("anna");
    expect(slugifyUsername("Anna Beauty")).toBe("anna-beauty");
    expect(slugifyUsername("###")).toBe("");
  });

  it("validates usernames and rejects reserved or invalid values", () => {
    expect(validateUsername("anna-beauty").ok).toBe(true);
    expect(validateUsername("booking").ok).toBe(false);
    expect(validateUsername("aa").ok).toBe(false);
    expect(validateUsername("anna--beauty").ok).toBe(false);
    expect(validateUsername("12345").ok).toBe(false);
  });

  it("generates default username for studio", () => {
    const result = generateDefaultUsername({
      providerType: "STUDIO" as never,
      studioName: "My Studio",
    });
    expect(result).toBe("my-studio");
  });

  it("ensures unique username with suffix when taken", async () => {
    const taken = new Set(["taken"]);
    const prismaTx = {
      provider: {
        findUnique: vi.fn(async ({ where }) =>
          taken.has(where.publicUsername) ? { id: "p1" } : null
        ),
      },
      userProfile: {
        findUnique: vi.fn(async ({ where }) =>
          taken.has(where.publicUsername) ? { id: "u1" } : null
        ),
      },
      publicUsernameAlias: {
        findUnique: vi.fn(async ({ where }) =>
          taken.has(where.username) ? { id: "a1" } : null
        ),
      },
    };

    const result = await ensureUniqueUsername(prismaTx as never, "taken");
    expect(result).toBe("taken-2");
  });

  it("resolves public usernames and redirects aliases", async () => {
    const deps = {
      findProviderByUsernameOrAlias: vi.fn(async (username: string) => {
        if (username === "alias") {
          return { id: "p1", publicUsername: "real", isPublished: true, type: "MASTER" };
        }
        if (username === "real") {
          return { id: "p1", publicUsername: "real", isPublished: true, type: "MASTER" };
        }
        return null;
      }),
    };

    await expect(resolvePublicUsername(deps, "###")).resolves.toEqual({
      status: "not-found",
      reason: "invalid",
    });
    await expect(resolvePublicUsername(deps, "missing")).resolves.toEqual({
      status: "not-found",
      reason: "missing",
    });
    await expect(resolvePublicUsername(deps, "alias")).resolves.toEqual({
      status: "redirect",
      username: "real",
    });
    await expect(resolvePublicUsername(deps, "real")).resolves.toEqual({
      status: "found",
      providerId: "p1",
      providerType: "MASTER",
    });
  });

  it("resolves client public usernames", async () => {
    const deps = {
      findClientByUsernameOrAlias: vi.fn(async (username: string) => {
        if (username === "alias") {
          return { id: "c1", publicUsername: "real" };
        }
        if (username === "real") {
          return { id: "c1", publicUsername: "real" };
        }
        return null;
      }),
    };

    await expect(resolvePublicClientUsername(deps, "alias")).resolves.toEqual({
      status: "redirect",
      username: "real",
    });
    await expect(resolvePublicClientUsername(deps, "real")).resolves.toEqual({
      status: "found",
      clientId: "c1",
    });
  });
});
