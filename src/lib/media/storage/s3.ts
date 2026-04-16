import { Readable } from "stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageProvider, StorageReadResult, StorageWriteInput } from "@/lib/media/storage/types";
import { env } from "@/lib/env";

type S3Config = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
};

function requireS3Config(): S3Config {
  const bucket = env.S3_BUCKET?.trim() ?? "";
  const endpoint = env.S3_ENDPOINT?.trim() ?? "";
  const region = env.S3_REGION?.trim() ?? "";
  const accessKey = env.S3_ACCESS_KEY?.trim() ?? "";
  const secretKey = env.S3_SECRET_KEY?.trim() ?? "";

  const missing = [
    !bucket ? "S3_BUCKET" : null,
    !endpoint ? "S3_ENDPOINT" : null,
    !region ? "S3_REGION" : null,
    !accessKey ? "S3_ACCESS_KEY" : null,
    !secretKey ? "S3_SECRET_KEY" : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing S3 configuration: ${missing.join(", ")}`);
  }

  return { bucket, endpoint, region, accessKey, secretKey };
}

function isNoSuchKey(error: unknown): boolean {
  if (error && typeof error === "object" && "name" in error) {
    return (error as { name?: string }).name === "NoSuchKey";
  }
  return false;
}

export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private readonly client: S3Client;
  private readonly bucket: string;

  getPublicUrl(key: string): string | null {
    const publicUrl = env.S3_PUBLIC_URL?.trim();
    if (!publicUrl) return null;
    const normalizedBase = publicUrl.replace(/\/+$/, "");
    const normalizedKey = key.replace(/\\/g, "/").replace(/^\/+/, "");
    return `${normalizedBase}/${normalizedKey}`;
  }

  constructor() {
    const cfg = requireS3Config();
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: cfg.accessKey,
        secretAccessKey: cfg.secretKey,
      },
    });
  }

  async putObject(input: StorageWriteInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.bytes,
        ContentType: input.contentType,
      })
    );
  }

  async getObject(key: string, contentType: string): Promise<StorageReadResult | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      const body = response.Body;
      if (!body || !(body instanceof Readable)) {
        throw new Error("S3 response body is not a Readable stream");
      }

      return {
        stream: body,
        sizeBytes: response.ContentLength ?? 0,
        contentType,
      };
    } catch (error) {
      if (isNoSuchKey(error)) return null;
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
    } catch (error) {
      if (isNoSuchKey(error)) return;
      throw error;
    }
  }
}
