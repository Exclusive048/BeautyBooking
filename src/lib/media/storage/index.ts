import type { StorageProvider } from "@/lib/media/storage/types";
import { LocalStorageProvider } from "@/lib/media/storage/local";

let provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (provider) return provider;
  provider = new LocalStorageProvider();
  return provider;
}
