"use client";

import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/lib/hooks/use-me";

export type ActiveRole = "CLIENT" | "MASTER" | "STUDIO";

const STORAGE_KEY = "active-role";
const PROFESSIONAL_ROLES: ActiveRole[] = ["STUDIO", "MASTER"];

function pickAutoRole(roles: string[]): ActiveRole {
  // Priority: STUDIO > MASTER > CLIENT
  if (roles.includes("STUDIO") || roles.includes("STUDIO_ADMIN")) return "STUDIO";
  if (roles.includes("MASTER")) return "MASTER";
  return "CLIENT";
}

function readStored(): ActiveRole | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "CLIENT" || v === "MASTER" || v === "STUDIO") return v;
  } catch {
    // localStorage unavailable
  }
  return null;
}

function writeStored(role: ActiveRole): void {
  try {
    localStorage.setItem(STORAGE_KEY, role);
  } catch {
    // no-op
  }
}

export function useActiveRole() {
  const { user, isLoading } = useMe();
  const [activeRole, setActiveRoleState] = useState<ActiveRole>("CLIENT");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (isLoading || !user) return;

    const userRoles = user.roles ?? [];
    const available = availableRoles(userRoles);

    const stored = readStored();
    if (stored && available.includes(stored)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveRoleState(stored);
    } else {
      const auto = pickAutoRole(userRoles);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveRoleState(auto);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, [isLoading, user]);

  const setRole = useCallback((role: ActiveRole) => {
    writeStored(role);
    setActiveRoleState(role);
  }, []);

  return {
    activeRole,
    setRole,
    hydrated,
    isLoading,
    availableRoles: availableRoles(user?.roles ?? []),
    hasProfessionalRole: (user?.roles ?? []).some((r) => PROFESSIONAL_ROLES.includes(r as ActiveRole)),
    hasMaster: (user?.roles ?? []).includes("MASTER"),
    hasStudio: (user?.roles ?? []).some((r) => r === "STUDIO" || r === "STUDIO_ADMIN"),
  };
}

function availableRoles(roles: string[]): ActiveRole[] {
  const result: ActiveRole[] = [];
  if (roles.includes("CLIENT")) result.push("CLIENT");
  if (roles.includes("MASTER")) result.push("MASTER");
  if (roles.includes("STUDIO") || roles.includes("STUDIO_ADMIN")) result.push("STUDIO");
  // Always show CLIENT as option if user is logged in (guest excluded)
  if (result.length > 0 && !result.includes("CLIENT")) result.unshift("CLIENT");
  return result;
}
