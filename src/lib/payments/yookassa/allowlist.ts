import { isIP } from "net";

export const YOOKASSA_ALLOWED_IP_RANGES = [
  // TODO: Update allowlist periodically from official YooKassa docs.
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.154.128/25",
  "77.75.156.11/32",
  "77.75.156.35/32",
  "2a02:5180::/32",
];

type CidrRange =
  | { version: 4; network: number; mask: number }
  | { version: 6; network: number[]; mask: number[] };

function parseIpv4(input: string): number | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = (value << 8) + octet;
  }
  return value >>> 0;
}

function parseIpv6(input: string): number[] | null {
  const [raw] = input.split("%");
  const normalized = raw.toLowerCase();
  if (!normalized) return null;

  const hasIpv4 = normalized.includes(".");
  const parts = normalized.split("::");
  if (parts.length > 2) return null;

  let head = parts[0] ? parts[0].split(":").filter(Boolean) : [];
  let tail = parts[1] ? parts[1].split(":").filter(Boolean) : [];

  if (hasIpv4) {
    const ipv4Part = tail.length > 0 ? tail[tail.length - 1] : head[head.length - 1];
    const ipv4 = parseIpv4(ipv4Part ?? "");
    if (ipv4 === null) return null;
    const high = ((ipv4 >>> 16) & 0xffff).toString(16);
    const low = (ipv4 & 0xffff).toString(16);
    if (tail.length > 0) {
      tail = [...tail.slice(0, -1), high, low];
    } else {
      head = [...head.slice(0, -1), high, low];
    }
  }

  const missing = parts.length === 2 ? 8 - (head.length + tail.length) : 0;
  if (missing < 0) return null;
  const full =
    parts.length === 2 ? [...head, ...Array(missing).fill("0"), ...tail] : head;
  if (full.length !== 8) return null;

  const segments: number[] = [];
  for (const part of full) {
    if (!part) return null;
    const value = parseInt(part, 16);
    if (!Number.isFinite(value) || value < 0 || value > 0xffff) return null;
    segments.push(value);
  }
  return segments;
}

function buildIpv6Mask(maskBits: number): number[] {
  const mask: number[] = [];
  let remaining = maskBits;
  for (let i = 0; i < 8; i += 1) {
    if (remaining >= 16) {
      mask.push(0xffff);
      remaining -= 16;
      continue;
    }
    if (remaining <= 0) {
      mask.push(0);
      continue;
    }
    const segment = (0xffff << (16 - remaining)) & 0xffff;
    mask.push(segment);
    remaining = 0;
  }
  return mask;
}

function parseCidr(cidr: string): CidrRange | null {
  const [ip, maskText] = cidr.split("/");
  if (!ip || !maskText) return null;
  const version = isIP(ip);
  const mask = Number(maskText);
  if (!Number.isFinite(mask)) return null;

  if (version === 4) {
    if (mask < 0 || mask > 32) return null;
    const network = parseIpv4(ip);
    if (network === null) return null;
    const maskValue = mask === 0 ? 0 : (~0 >>> (32 - mask)) << (32 - mask);
    return { version: 4, network, mask: maskValue >>> 0 };
  }

  if (version === 6) {
    if (mask < 0 || mask > 128) return null;
    const network = parseIpv6(ip);
    if (network === null) return null;
    return { version: 6, network, mask: buildIpv6Mask(mask) };
  }

  return null;
}

function matchesIpv6(value: number[], network: number[], mask: number[]): boolean {
  for (let i = 0; i < 8; i += 1) {
    if ((value[i] & mask[i]) !== (network[i] & mask[i])) return false;
  }
  return true;
}

const PARSED_RANGES = YOOKASSA_ALLOWED_IP_RANGES.map(parseCidr).filter(
  (value): value is CidrRange => Boolean(value)
);

export function isYookassaIpAllowed(ip: string): boolean {
  const version = isIP(ip);
  if (version === 0) return false;

  if (version === 4) {
    const value = parseIpv4(ip);
    if (value === null) return false;
    return PARSED_RANGES.some(
      (range) =>
        range.version === 4 &&
        (value & range.mask) === (range.network & range.mask)
    );
  }

  const value6 = parseIpv6(ip);
  if (value6 === null) return false;
  return PARSED_RANGES.some(
    (range) => range.version === 6 && matchesIpv6(value6, range.network, range.mask)
  );
}
