import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const categories = await prisma.globalCategory.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      status: true,
      context: true,
      usageCount: true,
      createdAt: true,
      createdBy: {
        select: { id: true, displayName: true, phone: true, email: true },
      },
    },
  });

  const pending = categories.filter((category) => category.status === "PENDING");

  return ok({
    categories: categories.map((category) => ({
      ...category,
      createdAt: category.createdAt.toISOString(),
    })),
    moderation: {
      categories: pending.map((category) => ({
        ...category,
        createdAt: category.createdAt.toISOString(),
      })),
      tags: [],
    },
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  void req;
  return fail("Этот адрес больше не используется — обратитесь к /api/admin/catalog/categories.", 410, "GONE");
}
