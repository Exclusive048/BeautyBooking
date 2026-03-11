import { PrismaClient } from "@prisma/client";

const globalForPrismaDirect = globalThis as typeof globalThis & {
  __beautyhubPrismaDirect?: PrismaClient;
};

const directUrl = process.env.DIRECT_URL;

if (!directUrl) {
  throw new Error("DIRECT_URL is required for prismaDirect client");
}

const createPrismaDirectClient = (): PrismaClient =>
  new PrismaClient({
    datasources: {
      db: { url: directUrl },
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

export const prismaDirect = globalForPrismaDirect.__beautyhubPrismaDirect ?? createPrismaDirectClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrismaDirect.__beautyhubPrismaDirect = prismaDirect;
}
