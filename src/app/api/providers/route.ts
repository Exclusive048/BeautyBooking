import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const providers = await prisma.provider.findMany({
    orderBy: [{ rating: "desc" }, { reviews: "desc" }],
  });
  return NextResponse.json(providers);
}
