import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * RKN-FIX-12 — the "no third-party OAuth token at rest" property, pinned.
 *
 * The audit's finding was that `VkLink`/`YandexLink` token columns were
 * WRITE-ONLY: the OAuth callbacks fetch the provider profile with the fresh
 * token from the code exchange (a local variable), `refreshVkToken` had zero
 * callers, and the lone reader — a best-effort `logoutVkSession` on integration
 * disable — existed only to revoke the token we ourselves stored. So the fix
 * was minimization, not encryption: the columns are gone.
 *
 * That property is easy to undo by accident — one `accessToken: token.accessToken`
 * added back to an upsert during a future OAuth change is all it takes, and
 * nothing else in the suite would notice. Hence two layers, mirroring инв. #25's
 * `client-privacy.test.ts`: schema-level (DMMF) and source-level (the routes).
 */

const LINK_MODELS = ["VkLink", "YandexLink"] as const;

/** Columns that must never exist on a provider-link model again. */
const FORBIDDEN_FIELDS = ["accessToken", "refreshToken"];

function modelFieldNames(modelName: string): string[] {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
  if (!model) throw new Error(`${modelName} missing from the Prisma DMMF`);
  return model.fields.map((f) => f.name);
}

describe("provider links — schema level", () => {
  it.each(LINK_MODELS)("%s stores no provider tokens", (modelName) => {
    const fields = modelFieldNames(modelName);
    const offenders = FORBIDDEN_FIELDS.filter((name) => fields.includes(name));

    expect(
      offenders,
      `${modelName} re-introduced ${offenders.join(", ")}. Persisting a third-party ` +
        "OAuth token means a DB leak hands out live access to users' VK/Yandex accounts. " +
        "If a feature genuinely needs one, it does NOT get a plaintext column: encrypt at " +
        "rest (AES-256-GCM, versioned envelope, AAD bound to the row) and say so in the " +
        "RKN-FIX-12 report.",
    ).toEqual([]);
  });

  it("keeps the identity columns the flows actually need", () => {
    // Guards the other direction: minimization must not have taken out the
    // link identity, which account-linking and the planned VK Bot delivery
    // (community token + peer id) both depend on.
    expect(modelFieldNames("VkLink")).toEqual(expect.arrayContaining(["vkUserId", "deviceId"]));
    expect(modelFieldNames("YandexLink")).toEqual(expect.arrayContaining(["yandexUserId"]));
  });
});

describe("provider links — source level", () => {
  const ROUTES = [
    "src/app/api/auth/vk/callback/route.ts",
    "src/app/api/auth/yandex/callback/route.ts",
    "src/app/api/integrations/vk/callback/route.ts",
    "src/app/api/integrations/vk/disable/route.ts",
    "src/app/api/auth/vk/unlink/route.ts",
    "src/app/api/auth/yandex/unlink/route.ts",
  ];

  it.each(ROUTES)("%s never writes or selects a provider token", (relativePath) => {
    const source = readFileSync(resolve(relativePath), "utf8");
    // Strip comments — the routes deliberately DISCUSS the removed columns.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");

    // `token.accessToken` (the fresh exchange result, used for the profile
    // fetch) is legitimate; a Prisma payload key `accessToken:` is not.
    expect(code, `${relativePath} assigns a provider token in a Prisma payload`).not.toMatch(
      /^\s*(accessToken|refreshToken)\s*:/m,
    );
  });

  it("no helper takes a stored provider token any more", () => {
    const oauth = readFileSync(resolve("src/lib/vk/oauth.ts"), "utf8");
    const code = oauth.replace(/\/\*[\s\S]*?\*\//g, "");
    // Both were removed with the columns; their signatures were the invitation
    // to store one again.
    expect(code).not.toMatch(/export async function refreshVkToken/);
    expect(code).not.toMatch(/export async function logoutVkSession/);
  });
});
