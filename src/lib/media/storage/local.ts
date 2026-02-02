import { createReadStream } from "fs";
import { mkdir, rm, stat, writeFile } from "fs/promises";
import { dirname, join, normalize } from "path";
import type { StorageProvider, StorageReadResult, StorageWriteInput } from "@/lib/media/storage/types";

const MEDIA_ROOT = process.env.MEDIA_LOCAL_ROOT?.trim() || join(process.cwd(), "storage", "media");

function resolvePathFromKey(key: string): string {
  const safe = normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  return join(MEDIA_ROOT, safe);
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";

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
