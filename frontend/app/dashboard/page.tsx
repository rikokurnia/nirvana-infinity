"use client";

import { useAuth } from "@/app/providers/privy-provider";
import { useRole } from "@/hooks/use-role";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardRedirect() {
  const { authenticated, ready } = useAuth();
  const { role, ready: roleReady } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
      return;
    }
    if (ready && authenticated && roleReady) {
      if (!role) {
        router.push("/onboarding/role");
      } else {
        router.push(`/dashboard/${role}`);
      }
    }
  }, [ready, authenticated, roleReady, role, router]);

  return null;
}
