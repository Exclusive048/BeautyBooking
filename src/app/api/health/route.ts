import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedisConnection } from "@/lib/redis/connection";

export const runtime = "nodejs";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redis = await getRedisConnection();
    if (!redis) {
      return NextResponse.json({ ok: false }, { status: 503 });
    }
    await redis.ping();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
