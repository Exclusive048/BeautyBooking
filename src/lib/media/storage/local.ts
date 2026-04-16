import { createReadStream } from "fs";
import { mkdir, rm, stat, writeFile } from "fs/promises";
import { dirname, join, normalize } from "path";
import type { StorageProvider, StorageReadResult, StorageWriteInput } from "@/lib/media/storage/types";
import { env } from "@/lib/env";

const MEDIA_ROOT = env.MEDIA_LOCAL_ROOT?.trim() || join(process.cwd(), "public", "uploads");

function sanitizePathSegment(segment: string): string {
  return segment.replace(/[:\*\?"<>\|\\\/]/g, "_");
}

function resolvePathFromKey(key: string): string {
  const normalized = normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  const segments = normalized
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    .map((segment) => sanitizePathSegment(segment))
    .filter((segment) => segment.length > 0);

  return join(MEDIA_ROOT, ...segments);
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";

  getPublicUrl(key: string): string | null {
    const baseUrl = env.MEDIA_LOCAL_PUBLIC_URL?.trim();
    if (!baseUrl) return null;
    const normalizedBase = baseUrl.replace(/\/+$/, "");
    const urlPath = key.replace(/\\/g, "/").replace(/^\/+/, "");
    return `${normalizedBase}/${urlPath}`;
  }

  async putObject(input: StorageWriteInput): Promise<void> {
    const fullPath = resolvePathFromKey(input.key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, input.bytes);
  }

  async getObject(key: string, contentType: string): Promise<StorageReadResult | null> {
    const fullPath = resolvePathFromKey(key);
    try {
      const fileStat = await stat(fullPath);
      if (!fileStat.isFile()) return null;
      return {
        stream: createReadStream(fullPath),
        sizeBytes: fileStat.size,
        contentType,
      };
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const fullPath = resolvePathFromKey(key);
    try {
      await rm(fullPath, { force: true });
    } catch {
      // ignore delete errors for missing files
    }
  }
}
