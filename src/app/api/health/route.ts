import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedisConnection } from "@/lib/redis/connection";

export const runtime = "nodejs";

export async function GET() {
  let db = false;
  let redis = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    // db stays false
  }

  try {
    const client = await getRedisConnection();
    if (client) {
      await client.ping();
      redis = true;
    }
  } catch {
    // redis stays false
  }

  const allOk = db && redis;
  return NextResponse.json(
    { ok: allOk, db, redis },
    { status: allOk ? 200 : 503 }
  );
}
