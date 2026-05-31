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
  Menu,
  X,
  History as HistoryIcon,
} from "lucide-react";
import { formatAddress } from "@/lib/utils";
import { useState } from "react";
import { ThemeToggle } from "@/app/components/theme-toggle";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (ready && !authenticated) router.push("/");
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (ready && authenticated && roleReady && !role) {
      router.push("/onboarding/role");
    }
  }, [ready, authenticated, roleReady, role, router]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

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
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        role={role}
        pathname={pathname}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="ml-0 md:ml-60">
        <TopBar
          address={address}
          isFounder={isFounder}
          onCopy={handleCopy}
          copied={copied}
          onLogout={logout}
          pathname={pathname}
          onMenu={() => setSidebarOpen(true)}
        />
        <main className="p-4 sm:p-6 min-h-[calc(100vh-3.5rem)]">{children}</main>
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
  onMenu,
}: {
  address: string;
  isFounder: boolean;
  onCopy: () => void;
  copied: boolean;
  onLogout: () => void;
  pathname: string;
  onMenu: () => void;
}) {
  const getTitle = () => {
    if (pathname.includes("/create")) return "Create Stream";
    if (pathname.includes("/streams")) return "Streams";
    if (pathname.includes("/presets")) return "Customize Presets";
    return "Overview";
  };

  return (
    <div className="sticky top-0 z-30 border-b border-hairline-soft bg-background/60 backdrop-blur-xl">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenu}
            aria-label="Open menu"
            className="md:hidden p-1.5 -ml-1 rounded-sm text-on-surface-variant hover:text-mint transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="font-headline text-sm font-bold text-on-surface tracking-tight truncate">
              {getTitle()}
            </h2>
            <p className="font-mono text-[9px] text-on-surface-variant/50 uppercase tracking-widest">
              {isFounder ? "Founder" : "Worker"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <button
            onClick={onCopy}
            className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-surface-1 border border-hairline hover:border-mint/30 hover:bg-mint/5 transition-all group"
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
            <span className="hidden sm:inline">Disconnect</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  role,
  pathname,
  open,
  onClose,
}: {
  role: string;
  pathname: string;
  open: boolean;
  onClose: () => void;
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

  const go = (path: string) => {
    router.push(path);
    onClose();
  };

  return (
    <aside
      className={`fixed top-0 left-0 w-60 h-screen glass-plate border-r border-hairline-soft flex flex-col z-50 transition-transform duration-200 md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="p-5 pb-4 border-b border-hairline-soft flex items-start justify-between">
        <div>
          <div
            onClick={() => go("/")}
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
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="md:hidden p-1 -mr-1 text-on-surface-variant hover:text-mint transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1 p-3 overflow-y-auto">
        {menuItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => go(item.path)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-sm font-mono text-[11px] font-bold tracking-widest uppercase transition-all ${
                active
                  ? "bg-mint/10 text-mint border-l-2 border-mint"
                  : "text-on-surface-variant/60 hover:text-on-surface-variant hover:bg-surface-1 border-l-2 border-transparent"
              }`}
            >
              <item.icon className={`w-4 h-4 ${active ? "text-mint" : "text-on-surface-variant/40"}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-hairline-soft flex flex-col gap-0.5">
        <button
          onClick={() => {
            setRole(null);
            go("/onboarding/role");
          }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-sm font-mono text-[11px] font-bold tracking-widest uppercase text-on-surface-variant/40 hover:text-mint hover:bg-surface-1 transition-all border-l-2 border-transparent"
        >
          <ArrowLeft className="w-4 h-4" />
          Switch Role
        </button>

        <button
          onClick={() => go("/")}
          className="flex items-center gap-3 px-3 py-2.5 rounded-sm font-mono text-[11px] font-bold tracking-widest uppercase text-on-surface-variant/40 hover:text-on-surface-variant hover:bg-surface-1 transition-all border-l-2 border-transparent"
        >
          <Home className="w-4 h-4" />
          Landing Page
        </button>
      </div>
    </aside>
  );
}
