import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-text-main">
        {UI_TEXT.pages.notFound.title}
      </h1>
      <p className="mt-2 text-text-sec">
        {UI_TEXT.pages.notFound.subtitle}
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Button asChild>
          <Link href="/">{UI_TEXT.pages.notFound.goHome}</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/catalog">{UI_TEXT.pages.notFound.goCatalog}</Link>
        </Button>
      </div>
    </div>
  );
}
