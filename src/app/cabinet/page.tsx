import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export default async function CabinetHubPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const items: { title: string; desc: string; href: string; visible: boolean }[] = [
    { title: "Клиент", desc: "Мои записи и история", href: "/client", visible: user.roles.includes("CLIENT") },
    { title: "Мастер", desc: "Заявки и настройки профиля", href: "/master", visible: user.roles.includes("MASTER") },
    { title: "Студия", desc: "Записи студии, услуги, мастера", href: "/studio", visible: user.roles.includes("STUDIO") || user.roles.includes("STUDIO_ADMIN") },
  ];

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Кабинет</h1>
      <p className="mt-2 text-neutral-600">
        Выберите раздел, который хотите открыть.
      </p>

      <div className="mt-6 grid gap-3">
        {items.filter(i => i.visible).map((i) => (
          <Link key={i.href} href={i.href} className="rounded-2xl border p-4 hover:bg-neutral-50 transition">
            <div className="font-medium">{i.title}</div>
            <div className="mt-1 text-sm text-neutral-600">{i.desc}</div>
          </Link>
        ))}
      </div>

      <div className="mt-8 text-sm text-neutral-600">
        Хотите добавить роль? Перейдите в{" "}
        <Link className="underline" href="/roles">
          управление ролями
        </Link>
        .
      </div>
    </div>
  );
}
