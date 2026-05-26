"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "./privy-provider";
import { useRole } from "@/hooks/use-role";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { authenticated, ready } = useAuth();
  const { role, ready: roleReady } = useRole();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (ready && authenticated && roleReady) {
      if (!role && pathname !== "/onboarding/role") {
        router.push("/onboarding/role");
        return;
      }
      if (role && pathname === "/onboarding/role") {
        router.push(`/dashboard/${role}`);
        return;
      }
      if (role && pathname === "/dashboard") {
        router.push(`/dashboard/${role}`);
        return;
      }
    }
  }, [ready, authenticated, roleReady, role, pathname, router]);

  if (!ready || !authenticated) return null;
  if (!roleReady) return null;
  if (!role && pathname !== "/onboarding/role") return null;

  return <>{children}</>;
}
