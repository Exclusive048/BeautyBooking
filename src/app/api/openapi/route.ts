import { NextResponse } from "next/server";
import { getOpenApiSpec } from "@/lib/openapi/spec";

export async function GET() {
  const body = JSON.stringify(getOpenApiSpec());
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
