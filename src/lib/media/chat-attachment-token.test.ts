import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildChatAttachmentUrl,
  createChatAttachmentToken,
  createPrivateMediaDeliveryToken,
  verifyChatAttachmentToken,
} from "@/lib/media/private-delivery";

/**
 * MASTER-CHAT-ATTACHMENT-FIX-A — chat-attachment opaque-token tests.
 *
 * The chat bubble renderer never sees the prisma asset cuid — only an
 * opaque signed token in the path: `/api/chat/attachment/{token}`. These
 * tests fence the token contract so future commits can't accidentally
 * regress to leaking the id back into the URL.
 */

describe("createChatAttachmentToken / verifyChatAttachmentToken", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("roundtrip — verify returns the embedded assetId", () => {
    const token = createChatAttachmentToken("asset_abc123");
    const verified = verifyChatAttachmentToken(token);
    expect(verified).toEqual({ assetId: "asset_abc123" });
  });

  it("token has at least two `.`-separated parts (payload.signature)", () => {
    const token = createChatAttachmentToken("asset_xyz");
    const parts = token.split(".");
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it("token does NOT contain the assetId in plaintext", () => {
    // Critical: the user requirement is «никаких ID в запросе». If the
    // assetId leaks into the token string verbatim, the URL still
    // exposes the cuid even if technically signed. Token payload is
    // base64url(JSON({aid, exp, purpose})) — the assetId is inside the
    // base64 blob but never visible as plaintext.
    const token = createChatAttachmentToken("cmpd4gnvb000fvleozdlhin6w");
    expect(token).not.toContain("cmpd4gnvb000fvleozdlhin6w");
  });

  it("expired token returns null", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    const token = createChatAttachmentToken("asset_1");
    // Advance 16 minutes — token TTL is 15 mins.
    vi.setSystemTime(new Date("2026-01-01T12:16:00Z"));
    expect(verifyChatAttachmentToken(token)).toBeNull();
  });

  it("tampered signature returns null", () => {
    const token = createChatAttachmentToken("asset_1");
    const [payload, signature] = token.split(".");
    // Flip one character in the signature → verifySignature fails.
    const tamperedSig = signature.startsWith("a")
      ? `b${signature.slice(1)}`
      : `a${signature.slice(1)}`;
    expect(verifyChatAttachmentToken(`${payload}.${tamperedSig}`)).toBeNull();
  });

  it("malformed token returns null (not a throw)", () => {
    expect(verifyChatAttachmentToken("not.a.real.token")).toBeNull();
    expect(verifyChatAttachmentToken("")).toBeNull();
    expect(verifyChatAttachmentToken("only-one-part")).toBeNull();
  });

  it("rejects tokens minted with the wrong `purpose` (cross-purpose replay)", () => {
    // Manually craft a token with the generic media-read purpose — the
    // chat-attachment verifier must reject it. This guards against an
    // attacker swapping a media-read token (perhaps obtained from a
    // booking-reference download) onto the chat-attachment endpoint.
    //
    // We re-use the project's `createPrivateMediaDeliveryToken` (which
    // uses `purpose: "media-read"`) and expect `verifyChatAttachmentToken`
    // to refuse it.
    const mediaReadToken = createPrivateMediaDeliveryToken({ assetId: "asset_1" });
    expect(verifyChatAttachmentToken(mediaReadToken)).toBeNull();
  });
});

describe("buildChatAttachmentUrl", () => {
  it("returns a /api/chat/attachment/<token> path", () => {
    const url = buildChatAttachmentUrl("asset_xyz");
    expect(url).toMatch(/^\/api\/chat\/attachment\//);
  });

  it("URL does NOT contain the assetId cuid", () => {
    const url = buildChatAttachmentUrl("cmpd4gnvb000fvleozdlhin6w");
    expect(url).not.toContain("cmpd4gnvb000fvleozdlhin6w");
  });

  it("URL contains exactly one token segment after /attachment/", () => {
    const url = buildChatAttachmentUrl("asset_xyz");
    const segments = url.replace(/^\/api\/chat\/attachment\//, "").split("/");
    expect(segments.length).toBe(1);
    expect(segments[0].length).toBeGreaterThan(20); // base64-encoded payload + sig
  });

  it("the verified URL roundtrips to the original assetId", () => {
    const url = buildChatAttachmentUrl("asset_round");
    const token = url.replace(/^\/api\/chat\/attachment\//, "");
    expect(verifyChatAttachmentToken(token)).toEqual({ assetId: "asset_round" });
  });
});
