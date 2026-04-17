import type { Metadata } from "next";
import { PenLine } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import { InfoPageLayout } from "@/components/layout/info-page-layout";

export const metadata: Metadata = {
  title: UI_TEXT.pages.blog.title,
  description: UI_TEXT.pages.blog.description,
};

const COMING_SOON_POSTS = UI_TEXT.pages.blog.comingSoonPosts;

export default function BlogPage() {
  return (
    <main className="mx-auto max-w-[900px] px-4 py-12 md:py-20 space-y-12">
      <InfoPageLayout breadcrumb={UI_TEXT.pages.blog.navLabel}>

        {/* Hero */}
        <section className="space-y-3 pt-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
            {UI_TEXT.pages.blog.heroBadge}
          </div>
          <h1 className="text-4xl font-bold text-text-main tracking-tight">
            {UI_TEXT.pages.blog.heroTitle}
          </h1>
          <p className="text-text-sec text-lg">
            {UI_TEXT.pages.blog.heroSubtitle}
          </p>
        </section>

        {/* Coming soon banner */}
        <div className="lux-card rounded-[20px] bg-bg-card border border-border-subtle p-6 flex items-center gap-4">
          <PenLine className="h-8 w-8 text-text-sec shrink-0" aria-hidden />
          <div>
            <p className="font-semibold text-text-main">{UI_TEXT.pages.blog.comingSoonTitle}</p>
            <p className="text-sm text-text-sec mt-0.5">
              {UI_TEXT.pages.blog.comingSoonSubtitle}
            </p>
          </div>
        </div>

        {/* Upcoming posts */}
        <section className="space-y-4">
          {COMING_SOON_POSTS.map((post) => (
            <div
              key={post.title}
              className="lux-card rounded-[20px] bg-bg-card p-6 flex gap-5 items-start opacity-80"
            >
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-border-subtle px-2.5 py-0.5 text-xs text-text-sec">
                    {post.tag}
                  </span>
                  <span className="text-xs text-text-sec">{post.date}</span>
                </div>
                <p className="font-semibold text-text-main">{post.title}</p>
                <p className="text-sm text-text-sec leading-relaxed">{post.desc}</p>
              </div>
            </div>
          ))}
        </section>

      </InfoPageLayout>
    </main>
  );
}
