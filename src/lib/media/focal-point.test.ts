import test from "node:test";
import assert from "node:assert/strict";
import { focalPointToObjectPosition } from "@/lib/media/focal-point";

test("focalPointToObjectPosition defaults to center", () => {
  assert.equal(focalPointToObjectPosition(null, null), "50% 50%");
  assert.equal(focalPointToObjectPosition(undefined, undefined), "50% 50%");
});

test("focalPointToObjectPosition maps 0 to 0%", () => {
  assert.equal(focalPointToObjectPosition(0, 0), "0% 0%");
});

test("focalPointToObjectPosition maps 1 to 100%", () => {
  assert.equal(focalPointToObjectPosition(1, 1), "100% 100%");
});
