const alertMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/alerting", () => ({
  alert: alertMock,
}));

import { clientPublicUrl, providerPublicUrl, studioBookingUrl, withQuery } from "@/lib/public-urls";

describe("public-urls", () => {
  beforeEach(() => {
    alertMock.mockReset();
  });

  it("builds stable query strings", () => {
    const url = withQuery("/path", { b: 2, a: "x", c: [1, 2] });
    expect(url).toBe("/path?a=x&b=2&c=1&c=2");
  });

  it("returns fallback provider url and alerts when username missing", () => {
    const url = providerPublicUrl({ id: "p1", publicUsername: null }, "ctx", "providers");
    expect(url).toBe("/providers/p1");
    expect(alertMock).toHaveBeenCalledTimes(1);
  });

  it("returns client url and alerts when username missing", () => {
    const url = clientPublicUrl({ id: "c1", publicUsername: null }, "ctx");
    expect(url).toBe("/clients/c1");
    expect(alertMock).toHaveBeenCalledTimes(1);
  });

  it("builds studio booking url with params", () => {
    const url = studioBookingUrl({ id: "s1", publicUsername: "studio" }, { serviceId: "svc" });
    expect(url).toBe("/u/studio/booking?serviceId=svc");
  });
});
