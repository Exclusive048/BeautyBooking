import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

type Props = {
  params: { id: string };
};

export const metadata: Metadata = {
  title: "Профиль клиента | МастерРядом",
  robots: { index: false, follow: false },
};

export default async function ClientIdPage({ params }: Props) {
  const client = await prisma.userProfile.findUnique({
    where: { id: params.id },
    select: { id: true, publicUsername: true },
  });

  if (!client) {
    notFound();
  }

  if (client.publicUsername) {
    permanentRedirect(`/c/${client.publicUsername}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-text-muted">
        Публичный профиль клиента недоступен.
      </div>
    </div>
  );
}

