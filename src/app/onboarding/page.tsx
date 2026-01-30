import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { AccountTypeCard } from "@/app/onboarding/account-type-card";

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Кто вы?</h1>
      <p className="mt-2 text-neutral-600">
        Выберите тип аккаунта. Это влияет на доступ к кабинетам.
      </p>

      <div className="mt-6 grid gap-3">
        <AccountTypeCard
          type="CLIENT"
          title="Я клиент"
          desc="Записываюсь к мастерам и в студии."
        />
        <RoleCard
          title="Я мастер"
          desc="У меня будет кабинет мастера и записи."
          href="/api/onboarding/professional/master"
        />
        <RoleCard
          title="Я студия"
          desc="Кабинет студии, мастера и услуги."
          href="/api/onboarding/professional/studio"
        />
      </div>

      <div className="mt-6 text-sm text-neutral-600">
        После выбора можно будет поменять в настройках (позже).
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