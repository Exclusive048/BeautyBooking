import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export default async function ProfessionalOnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Профессиональный профиль</h1>
      <p className="mt-2 text-neutral-600">
        Выберите путь — мастер или студия. Мы создадим нужный профиль и откроем кабинет.
      </p>

      <div className="mt-6 grid gap-3">
        <RoleCard
          title="Я мастер (работаю сам)"
          desc="Создать профиль мастера и перейти в кабинет мастера."
          href="/api/onboarding/professional/master"
        />
        <RoleCard
          title="Я представляю студию"
          desc="Создать студию, назначить меня администратором и открыть кабинет студии."
          href="/api/onboarding/professional/studio"
        />
      </div>

      <div className="mt-6 text-sm text-neutral-600">
        Клиентский кабинет доступен всегда — он создаётся автоматически.
      </div>

      <div className="mt-6">
        <Link className="underline" href="/">
          На главную
        </Link>
      </div>
    </div>
  );
}

function RoleCard({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <a className="rounded-2xl border p-4 hover:bg-neutral-50 transition" href={href}>
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-sm text-neutral-600">{desc}</div>
    </a>
  );
}
