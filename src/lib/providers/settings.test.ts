import test from "node:test";
import assert from "node:assert/strict";
import { ProviderType } from "@prisma/client";
import { isAutoConfirmAllowed } from "@/lib/providers/settings";

test("auto-confirm is allowed only for solo masters", () => {
  assert.equal(
    isAutoConfirmAllowed({ type: ProviderType.MASTER, studioId: null }),
    true
  );
  assert.equal(
    isAutoConfirmAllowed({ type: ProviderType.MASTER, studioId: "studio-1" }),
    false
  );
  assert.equal(
    isAutoConfirmAllowed({ type: ProviderType.STUDIO, studioId: null }),
    false
  );
});
