import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params; // ✅ важно: params — Promise

    if (!id) {
      return NextResponse.json({ message: "Missing provider id" }, { status: 400 });
    }

    const provider = await prisma.provider.findUnique({
      where: { id },
      include: { services: true },
    });

    if (!provider) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    return NextResponse.json(provider);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ message: "Internal error", detail }, { status: 500 });
  }
}
