"use client";

import { Wallet, LayoutDashboard, RefreshCw } from "lucide-react";
import { useAuth } from "@/app/providers/privy-provider";
import { useRole } from "@/hooks/use-role";
import { formatAddress } from "@/lib/utils";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const { login, logout, authenticated, user } = useAuth();
  const { role } = useRole();
  const router = useRouter();

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-black/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        <a href="/" className="text-2xl font-headline font-bold text-mint tracking-tighter flex items-center gap-2">
          <img src="/images/removbg.png" alt="Nirvana" className="w-8 h-8 object-contain" />
          Nirvana
        </a>
        <div className="hidden md:flex gap-8 items-center">
          {["Solutions", "Models", "Ecosystem", "Docs"].map((item) => (
            <a
              key={item}
              href="#"
              className="text-on-surface-variant font-mono text-xs font-bold hover:text-mint transition-colors px-2 py-1 rounded tracking-widest uppercase"
            >
              {item}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-4">
          {authenticated ? (
            <>
              {role && (
                <button
                  onClick={() => router.push(`/dashboard/${role}`)}
                  className="flex items-center gap-2 border border-mint/30 text-mint font-mono text-xs font-bold px-4 py-2 rounded-sm hover:bg-mint/10 transition-all uppercase"
                >
                  <LayoutDashboard className="w-3 h-3" />
                  Dashboard
                </button>
              )}
              <button
                onClick={() => router.push("/onboarding/role")}
                className="hidden sm:flex items-center gap-1 text-on-surface-variant font-mono text-[10px] hover:text-mint transition-colors uppercase tracking-widest"
              >
                <RefreshCw className="w-3 h-3" />
                Role
              </button>
              <span className="font-mono text-xs text-on-surface-variant hidden sm:block">
                {formatAddress(user?.wallet?.address || "")}
              </span>
              <button
                onClick={logout}
                className="border border-white/10 text-on-surface-variant font-mono text-xs font-bold px-4 py-2 rounded-sm hover:bg-white/5 transition-all uppercase"
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <button
                onClick={login}
                className="p-2 text-on-surface-variant hover:text-mint transition-colors cursor-pointer"
              >
                <Wallet className="w-5 h-5" />
              </button>
              <button
                onClick={login}
                className="bg-mint text-black font-mono text-xs font-bold px-6 py-2.5 rounded-sm hover:brightness-110 active:scale-95 transition-all uppercase"
              >
                Connect Wallet
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
