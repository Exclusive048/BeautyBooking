import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { resolvePublicClientUsername } from "@/lib/publicUsername";

type Props = {
  params: Promise<{ username: string }> | { username: string };
};

function normalizeUsername(input: string) {
  return input.trim().toLowerCase();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username: raw } = await Promise.resolve(params);
  const username = normalizeUsername(raw);
  const baseUrl = resolvePublicAppUrl();

  return {
    title: "Профиль клиента | МастерРядом",
    metadataBase: baseUrl ? new URL(baseUrl) : undefined,
    alternates: { canonical: `/c/${username}` },
    robots: { index: false, follow: false },
  };
}

export default async function ClientPublicPage({ params }: Props) {
  const { username: raw } = await Promise.resolve(params);
  const username = normalizeUsername(raw);

  const result = await resolvePublicClientUsername(
    {
      findClientByUsernameOrAlias: async (username: string) =>
        prisma.userProfile.findFirst({
          where: {
            OR: [
              { publicUsername: username },
              { publicUsernameAliases: { some: { username } } },
            ],
          },
          select: { id: true, publicUsername: true },
        }),
    },
    username
  );

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "redirect") {
    permanentRedirect(`/c/${result.username}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-text-muted">
        Публичный профиль клиента недоступен.
      </div>
    </div>
  );
}

