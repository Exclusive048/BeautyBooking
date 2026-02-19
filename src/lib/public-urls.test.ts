import test from "node:test";
import assert from "node:assert/strict";
import { providerPublicUrl, studioBookingUrl, withQuery } from "@/lib/public-urls";
import { setAlertHandler } from "@/lib/alerting";

test("providerPublicUrl returns slug url when available", () => {
  const url = providerPublicUrl({ id: "p1", publicUsername: "beauty-master" }, "test");
  assert.equal(url, "/u/beauty-master");
});

test("providerPublicUrl falls back and alerts when username missing", () => {
  let called = false;
  const prev = setAlertHandler(() => {
    called = true;
  });

  const url = providerPublicUrl({ id: "p2", publicUsername: null }, "test");
  assert.equal(url, "/providers/p2");
  assert.equal(called, true);

  setAlertHandler(prev);
});

test("withQuery builds stable query order", () => {
  const url = withQuery("/u/test", { b: "2", a: "1" });
  assert.equal(url, "/u/test?a=1&b=2");
});

test("studioBookingUrl builds booking link with params", () => {
  const url = studioBookingUrl({ id: "s1", publicUsername: "studio-1" }, { masterId: "m1", serviceId: "srv" });
  assert.equal(url, "/u/studio-1/booking?masterId=m1&serviceId=srv");
});
