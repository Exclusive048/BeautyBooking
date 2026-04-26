"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const STORAGE_KEY = "cookie-consent";
type ConsentValue = "accepted" | "rejected" | null;

function readStored(): ConsentValue {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "accepted" || v === "rejected") return v;
  } catch {
    // localStorage unavailable (SSR guard / private browsing)
  }
  return null;
}

function writeStored(v: "accepted" | "rejected") {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // no-op
  }
}

// Three phases:
//   "pending"  — SSR / not yet hydrated (renders nothing to avoid hydration mismatch)
//   null       — hydrated, no decision yet → show banner
//   "accepted" | "rejected" — decision made → hide banner
type Phase = "pending" | ConsentValue;

export function CookieConsent() {
  const t = UI_TEXT.cookieConsent;
  const [phase, setPhase] = useState<Phase>("pending");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration: detect client mount to read localStorage without SSR mismatch
    setPhase(readStored());
  }, []);

  const accept = () => {
    writeStored("accepted");
    setPhase("accepted");
  };

  const reject = () => {
    writeStored("rejected");
    setPhase("rejected");
  };

  // Don't render on server (hydration) or after a decision has been made
  if (phase !== null) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className="fixed bottom-0 left-0 right-0 z-[45] p-3 pb-safe md:p-5"
      >
        <div className="mx-auto max-w-5xl rounded-2xl border border-border-subtle bg-bg-card/95 p-4 shadow-hover backdrop-blur-md md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
            {/* Icon + text */}
            <div className="flex items-start gap-3 md:flex-1 md:items-center">
              <div className="shrink-0 rounded-xl bg-primary/10 p-2.5">
                <Cookie className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-text-main">{t.text}</p>
                <Link
                  href="/privacy"
                  className="mt-0.5 block text-xs text-primary hover:underline"
                >
                  {t.privacyLink}
                </Link>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 md:shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={reject}
                className="flex-1 md:flex-none"
              >
                {t.reject}
              </Button>
              <Button
                size="sm"
                onClick={accept}
                className="flex-1 md:flex-none"
              >
                {t.accept}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
