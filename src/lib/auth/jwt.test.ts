import { createSessionToken, verifySessionToken } from "@/lib/auth/jwt";

describe("auth/jwt", () => {
  const originalSecret = process.env.AUTH_JWT_SECRET;

  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = "test-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.AUTH_JWT_SECRET;
    } else {
      process.env.AUTH_JWT_SECRET = originalSecret;
    }
  });

  it("signs and verifies a token", () => {
    const token = createSessionToken(
      { sub: "user-1", phone: "+79991234567", roles: ["CLIENT"] },
      60
    );
    const payload = verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("user-1");
    expect(payload?.phone).toBe("+79991234567");
    expect(payload?.roles).toEqual(["CLIENT"]);
  });

  it("returns null for expired token", () => {
    const token = createSessionToken({ sub: "user-1" }, -1);
    expect(verifySessionToken(token)).toBeNull();
  });

  it("returns null for wrong secret", () => {
    const token = createSessionToken({ sub: "user-1" }, 60);
    process.env.AUTH_JWT_SECRET = "wrong-secret";
    expect(verifySessionToken(token)).toBeNull();
  });

  it("returns null for malformed token", () => {
    expect(verifySessionToken("invalid.token")).toBeNull();
  });
});
