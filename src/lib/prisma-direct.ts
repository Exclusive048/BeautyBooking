import "server-only"; // GUARDRAILS-01: hard-fail the build if this ever reaches a client bundle
import { PrismaClient } from "@prisma/client";
import { withStatementTimeout } from "@/lib/prisma-datasource";

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
      // RES-24: та же граница, что у пулового клиента — asymmetric-фикс оставил бы
      // второй путь записи без потолка
      db: { url: withStatementTimeout(directUrl) },
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

export const prismaDirect = globalForPrismaDirect.__beautyhubPrismaDirect ?? createPrismaDirectClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrismaDirect.__beautyhubPrismaDirect = prismaDirect;
}
