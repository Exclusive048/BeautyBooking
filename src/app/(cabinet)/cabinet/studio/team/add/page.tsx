import Link from "next/link";
import { UI_TEXT } from "@/lib/ui/text";

export default function AddStudioMasterPage() {
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{UI_TEXT.studioCabinet.teamAdd.title}</h2>
        <p className="text-sm text-neutral-600">{UI_TEXT.studioCabinet.teamAdd.subtitle}</p>
      </header>
      <div className="rounded-2xl border p-5 text-sm text-neutral-600">
        {UI_TEXT.studioCabinet.teamAdd.info}
      </div>
      <Link href="/cabinet/studio/team" className="inline-flex rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50">
        {UI_TEXT.studioCabinet.teamAdd.back}
      </Link>
    </section>
  );
}

