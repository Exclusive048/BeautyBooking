import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: UI_TEXT.pages.publicClient.title,
  robots: { index: false, follow: false },
};

export default async function ClientIdPage({ params }: Props) {
  const resolvedParams = await params;
  const client = await prisma.userProfile.findUnique({
    where: { id: resolvedParams.id },
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
        {UI_TEXT.pages.publicClient.unavailable}
      </div>
    </div>
  );
}

