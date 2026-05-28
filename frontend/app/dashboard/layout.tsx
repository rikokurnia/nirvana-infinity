"use client";

import { useRole } from "@/hooks/use-role";
import { useAuth } from "@/app/providers/privy-provider";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PlusCircle,
  List,
  Settings,
  ArrowLeft,
  Home,
  BarChart3,
  LogOut,
  Copy,
  Check,
  History as HistoryIcon,
} from "lucide-react";
import { formatAddress } from "@/lib/utils";
import { useState } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { authenticated, ready, user, logout } = useAuth();
  const { role, ready: roleReady } = useRole();
  const router = useRouter();
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (ready && !authenticated) router.push("/");
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (ready && authenticated && roleReady && !role) {
      router.push("/onboarding/role");
    }
  }, [ready, authenticated, roleReady, role, router]);

  if (!ready || !authenticated || !roleReady || !role) return null;

  const address = user?.wallet?.address || "";
  const isFounder = role === "founder";

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen">
      <div className="flex">
        <Sidebar role={role} pathname={pathname} />

        <div className="flex-1 ml-60">
          <TopBar
            address={address}
            isFounder={isFounder}
            onCopy={handleCopy}
            copied={copied}
            onLogout={logout}
            pathname={pathname}
          />
          <main className="p-6 min-h-[calc(100vh-3.5rem)]">{children}</main>
        </div>
      </div>
    </div>
  );
}

function TopBar({
  address,
  isFounder,
  onCopy,
  copied,
  onLogout,
  pathname,
}: {
  address: string;
  isFounder: boolean;
  onCopy: () => void;
  copied: boolean;
  onLogout: () => void;
  pathname: string;
}) {
  const getTitle = () => {
    if (pathname.includes("/create")) return "Create Stream";
    if (pathname.includes("/streams")) return "Streams";
    if (pathname.includes("/presets")) return "Customize Presets";
    return "Overview";
  };

  return (
    <div className="sticky top-0 z-30 border-b border-white/5 bg-black/60 backdrop-blur-xl">
      <div className="px-6 py-3 flex items-center justify-between">
        <div>
          <h2 className="font-headline text-sm font-bold text-on-surface tracking-tight">
            {getTitle()}
          </h2>
          <p className="font-mono text-[9px] text-on-surface-variant/50 uppercase tracking-widest">
            {isFounder ? "Founder" : "Worker"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onCopy}
            className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-white/3 border border-white/10 hover:border-mint/30 hover:bg-mint/5 transition-all group"
          >
            <span className="font-mono text-xs text-on-surface-variant group-hover:text-mint transition-colors">
              {formatAddress(address)}
            </span>
            {copied ? (
              <Check className="w-3 h-3 text-mint" />
            ) : (
              <Copy className="w-3 h-3 text-on-surface-variant/40 group-hover:text-mint/60 transition-colors" />
            )}
          </button>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-red-400/20 text-red-400 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-red-400/10 transition-all"
          >
            <LogOut className="w-3 h-3" />
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  role,
  pathname,
}: {
  role: string;
  pathname: string;
}) {
  const { setRole } = useRole();
  const router = useRouter();

  const isActive = (path: string) => {
    if (path === `/dashboard/${role}`) return pathname === path;
    return pathname.startsWith(path);
  };

  const founderMenu = [
    { label: "Overview", icon: LayoutDashboard, path: "/dashboard/founder" },
    { label: "Create Stream", icon: PlusCircle, path: "/dashboard/founder/create" },
    { label: "My Streams", icon: List, path: "/dashboard/founder/streams" },
    { label: "History", icon: HistoryIcon, path: "/dashboard/founder/history" },
    { label: "Customize Presets", icon: Settings, path: "/dashboard/founder/presets" },
    { label: "Analytics", icon: BarChart3, path: "/dashboard/analytics" },
  ];

  const workerMenu = [
    { label: "Overview", icon: LayoutDashboard, path: "/dashboard/worker" },
    { label: "My Streams", icon: List, path: "/dashboard/worker/streams" },
    { label: "History", icon: HistoryIcon, path: "/dashboard/worker/history" },
    { label: "Analytics", icon: BarChart3, path: "/dashboard/analytics" },
  ];

  const menuItems = role === "founder" ? founderMenu : workerMenu;

  return (
    <aside className="fixed top-0 left-0 w-60 h-screen glass-plate border-r border-white/5 flex flex-col">
      <div className="p-5 pb-4 border-b border-white/5">
        <div
          onClick={() => router.push("/")}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <img src="/images/removbg.png" alt="Nirvana" className="w-7 h-7 object-contain" />
          <span className="font-headline text-lg font-bold text-mint tracking-tighter group-hover:brightness-110 transition-all">
            Nirvana
          </span>
        </div>
        <p className="font-mono text-[9px] text-on-surface-variant/50 mt-0.5 uppercase tracking-widest">
          {role === "founder" ? "Founder" : "Worker"} — Devnet
        </p>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1 p-3">
        {menuItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-sm font-mono text-[11px] font-bold tracking-widest uppercase transition-all ${
                active
                  ? "bg-mint/10 text-mint border-l-2 border-mint"
                  : "text-on-surface-variant/60 hover:text-on-surface-variant hover:bg-white/3 border-l-2 border-transparent"
              }`}
            >
              <item.icon className={`w-4 h-4 ${active ? "text-mint" : "text-on-surface-variant/40"}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/5 flex flex-col gap-0.5">
        <button
          onClick={() => {
            setRole(null);
            router.push("/onboarding/role");
          }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-sm font-mono text-[11px] font-bold tracking-widest uppercase text-on-surface-variant/40 hover:text-mint hover:bg-white/3 transition-all border-l-2 border-transparent"
        >
          <ArrowLeft className="w-4 h-4" />
          Switch Role
        </button>

        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-3 px-3 py-2.5 rounded-sm font-mono text-[11px] font-bold tracking-widest uppercase text-on-surface-variant/40 hover:text-on-surface-variant hover:bg-white/3 transition-all border-l-2 border-transparent"
        >
          <Home className="w-4 h-4" />
          Landing Page
        </button>
      </div>
    </aside>
  );
}
