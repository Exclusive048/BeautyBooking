import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasAdminRole } from "@/lib/auth/guards";
import { SiteLogoManager } from "@/features/media/components/site-logo-manager";
import { LoginHeroImageManager } from "@/features/media/components/login-hero-image-manager";

const plans = [
  {
    name: "Free",
    price: "0 ₽",
    subtitle: "Для старта и тестирования",
    features: ["Каталог мастеров", "Запись онлайн", "Базовые уведомления"],
  },
  {
    name: "Pro (Master)",
    price: "990 ₽/мес",
    subtitle: "Для мастеров-одиночек",
    features: ["Профиль мастера", "Управление услугами", "Записи и статусы", "Клиентская база (MVP)"],
  },
  {
    name: "Studio",
    price: "3 990 ₽/мес",
    subtitle: "Для студий и команд",
    features: ["Профиль студии", "Несколько мастеров (позже)", "Записи студии", "Роли админов (позже)"],
  },
  {
    name: "Enterprise",
    price: "по запросу",
    subtitle: "Сети и кастомные интеграции",
    features: ["SLA/поддержка", "Интеграции", "Кастомный онбординг", "Отчёты/аналитика"],
  },
];

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasAdminRole(user)) redirect("/403");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      <div className="rounded-2xl border bg-white p-6">
        <div className="text-xs font-semibold text-neutral-500">ADMIN (временно)</div>
        <h1 className="mt-1 text-2xl font-semibold">Панель администратора</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Здесь пока статично зафиксированы планы подписок и базовые тексты. Позже подключим роли,
          управление и метрики.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SiteLogoManager />
        <LoginHeroImageManager />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Планы подписок</h2>

        <div className="grid gap-3 md:grid-cols-2">
          {plans.map((p) => (
            <div key={p.name} className="rounded-2xl border bg-white p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">{p.name}</div>
                  <div className="mt-1 text-sm text-neutral-600">{p.subtitle}</div>
                </div>
                <div className="text-sm font-semibold">{p.price}</div>
              </div>

              <ul className="mt-4 space-y-2 text-sm text-neutral-700">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="mt-[2px] inline-block h-4 w-4 rounded bg-neutral-900" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
