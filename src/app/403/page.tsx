import { UI_TEXT } from "@/lib/ui/text";

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-text-main">{UI_TEXT.pages.forbidden.title}</h1>
      <p className="mt-2 text-text-sec">{UI_TEXT.pages.forbidden.subtitle}</p>
    </div>
  );
}
