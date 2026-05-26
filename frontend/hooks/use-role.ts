"use client";

import { useState, useEffect, useCallback } from "react";

export type UserRole = "founder" | "worker" | null;

const ROLE_KEY = "nirvana_user_role";

export function useRole() {
  const [role, setRoleState] = useState<UserRole>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(ROLE_KEY);
    if (stored === "founder" || stored === "worker") {
      setRoleState(stored);
    }
    setReady(true);
  }, []);

  const setRole = useCallback((newRole: UserRole) => {
    if (newRole) {
      localStorage.setItem(ROLE_KEY, newRole);
    } else {
      localStorage.removeItem(ROLE_KEY);
    }
    setRoleState(newRole);
  }, []);

  return { role, setRole, ready };
}
