// Single PrismaClient instance shared by every seed-* file. Avoids exhausting
// the connection pool when the orchestrator wires several modules together.
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
