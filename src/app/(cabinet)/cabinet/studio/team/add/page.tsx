import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UI_TEXT } from "@/lib/ui/text";

export default function AddStudioMasterPage() {
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-text-main">{UI_TEXT.studioCabinet.teamAdd.title}</h2>
        <p className="text-sm text-text-sec">{UI_TEXT.studioCabinet.teamAdd.subtitle}</p>
      </header>
      <Card>
        <CardContent className="pt-5 text-sm text-text-sec">{UI_TEXT.studioCabinet.teamAdd.info}</CardContent>
      </Card>
      <Button asChild variant="secondary" size="sm">
        <Link href="/cabinet/studio/team">{UI_TEXT.studioCabinet.teamAdd.back}</Link>
      </Button>
    </section>
  );
}

