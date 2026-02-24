import crypto from "crypto";

function base64url(input: Buffer | string) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return b.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function sign(data: string, secret: string) {
  return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

export type SessionPayload = {
  sub: string; // userId
  phone?: string | null;
  roles?: string[];
  iat: number;
  exp: number;
};

export function createSessionToken(
  payload: Omit<SessionPayload, "iat" | "exp">,
  ttlSeconds: number
) {
  const secret = process.env.AUTH_JWT_SECRET!;
  if (!secret) throw new Error("AUTH_JWT_SECRET is not set");

  const header = { alg: "HS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;

  const fullPayload: SessionPayload = { ...payload, iat, exp };

  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(fullPayload));
  const data = `${encHeader}.${encPayload}`;
  const sig = sign(data, secret);

  return `${data}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const secret = process.env.AUTH_JWT_SECRET!;
  if (!secret) throw new Error("AUTH_JWT_SECRET is not set");

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = sign(data, secret);

  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(s);
  if (expectedBuf.length !== sigBuf.length) return null;
  if (!crypto.timingSafeEqual(expectedBuf, sigBuf)) return null;

  const payload = JSON.parse(fromBase64url(p)) as SessionPayload;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;

  return payload;
}
