"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

export default function VkLoginButton() {
  return (
    <Button asChild variant="secondary" size="lg" className="w-full">
      <Link href="/api/auth/vk/start">{UI_TEXT.auth.vk.loginButton}</Link>
    </Button>
  );
}
