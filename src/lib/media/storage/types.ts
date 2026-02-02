import type { Readable } from "stream";

export type StorageWriteInput = {
  key: string;
  bytes: Uint8Array;
  contentType: string;
};

export type StorageReadResult = {
  stream: Readable;
  sizeBytes: number;
  contentType: string;
};

export interface StorageProvider {
  readonly name: string;
  putObject(input: StorageWriteInput): Promise<void>;
  getObject(key: string, contentType: string): Promise<StorageReadResult | null>;
  deleteObject(key: string): Promise<void>;
}
