import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { setLastRole } from "@/app/(cabinet)/cabinet/actions";

export default async function RolesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Кто вы в BeautyHub?</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Выберите режим. Можно переключаться позже в кабинете.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <form action={chooseClient}>
          <button className="w-full rounded-2xl border bg-white p-6 text-left hover:bg-neutral-50">
            <div className="text-lg font-semibold">Клиент</div>
            <div className="mt-1 text-sm text-neutral-600">Записываться и смотреть свои записи.</div>
          </button>
        </form>

        <form action={chooseProvider}>
          <button className="w-full rounded-2xl border bg-white p-6 text-left hover:bg-neutral-50">
            <div className="text-lg font-semibold">Мастер / Студия</div>
            <div className="mt-1 text-sm text-neutral-600">Принимать записи и управлять профилем.</div>
          </button>
        </form>
      </div>
    </div>
  );
}

async function chooseClient() {
  "use server";
  await setLastRole("client");
  redirect("/cabinet");
}

async function chooseProvider() {
  "use server";
  await setLastRole("provider");
  redirect("/cabinet");
}
