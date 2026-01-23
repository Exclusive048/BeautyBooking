import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export default async function RolesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Роли</h1>
      <p className="mt-2 text-neutral-600">
        Вы можете использовать несколько ролей. Клиент доступен всегда.
      </p>

      <div className="mt-6 space-y-3">
        <RoleRow title="Клиент" active={user.roles.includes("CLIENT")} />
        <RoleRow
          title="Мастер"
          active={user.roles.includes("MASTER")}
          actionHref="/api/auth/roles/add?role=MASTER"
        />
        <RoleRow
          title="Студия"
          active={user.roles.includes("STUDIO")}
          actionHref="/api/auth/roles/add?role=STUDIO"
        />
      </div>

      <div className="mt-8">
        <Link href="/cabinet" className="underline">
          Назад в кабинет
        </Link>
      </div>
    </div>
  );
}

function RoleRow({
  title,
  active,
  actionHref,
}: {
  title: string;
  active: boolean;
  actionHref?: string;
}) {
  return (
    <div className="rounded-2xl border p-4 flex items-center justify-between gap-3">
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-sm text-neutral-600">
          {active ? "Подключено" : "Не подключено"}
        </div>
      </div>

      {active || !actionHref ? null : (
        <a className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium" href={actionHref}>
          Добавить
        </a>
      )}
    </div>
  );
}
