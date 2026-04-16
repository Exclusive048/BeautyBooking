import { env } from "@/lib/env";
import type { StorageProvider } from "@/lib/media/storage/types";
import { LocalStorageProvider } from "@/lib/media/storage/local";
import { S3StorageProvider } from "@/lib/media/storage/s3";

let provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!provider) {
    provider = env.STORAGE_PROVIDER === "s3" ? new S3StorageProvider() : new LocalStorageProvider();
  }
  return provider;
}
