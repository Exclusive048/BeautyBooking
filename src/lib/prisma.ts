import "server-only"; // GUARDRAILS-01: hard-fail the build if this ever reaches a client bundle
import { PrismaClient } from "@prisma/client";
import { withStatementTimeout } from "@/lib/prisma-datasource";

const globalForPrisma = globalThis as typeof globalThis & {
  __beautyhubPrisma?: PrismaClient;
};

const createPrismaClient = (): PrismaClient =>
  new PrismaClient({
    // RES-24: верхняя граница одного запроса; `undefined` = datasource из схемы
    datasourceUrl: withStatementTimeout(process.env.DATABASE_URL),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

export const prisma = globalForPrisma.__beautyhubPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__beautyhubPrisma = prisma;
}