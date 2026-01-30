import { Suspense } from "react";
import { redirect } from "next/navigation";
import LoginClient from "./login-client";
import { getSessionUser } from "@/lib/auth/session";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/cabinet?tab=profile");
  }

  return (
    <Suspense fallback={<div className="min-h-[70vh]" />}>
      <LoginClient />
    </Suspense>
  );
}
