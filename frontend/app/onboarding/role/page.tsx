"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useRole } from "@/hooks/use-role";
import { useAuth } from "@/app/providers/privy-provider";
import { Briefcase, Hammer } from "lucide-react";

export default function RolePage() {
  const { setRole } = useRole();
  const router = useRouter();

  const handleSelect = (role: "founder" | "worker") => {
    setRole(role);
    router.push(`/dashboard/${role}`);
  };

  return (
    <div className="min-h-screen pt-20 flex items-center justify-center px-6">
      <div className="text-center max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-center gap-2 mb-6">
            <img src="/images/removbg.png" alt="Nirvana" className="w-8 h-8 object-contain" />
            <span className="font-headline text-2xl font-bold text-mint tracking-tighter">Nirvana</span>
          </div>
          <h1 className="font-headline text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Choose Your Role
          </h1>
          <p className="font-mono text-xs text-on-surface-variant uppercase tracking-widest mb-12">
            This determines your dashboard experience
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ y: -4 }}
            onClick={() => handleSelect("founder")}
            className="glass-plate rounded-lg p-10 text-left hover:border-mint/30 transition-all group cursor-pointer"
          >
            <div className="w-16 h-16 bg-mint/10 flex items-center justify-center rounded-sm mb-6 ring-1 ring-mint/20 group-hover:bg-mint/20 transition-colors">
              <Briefcase className="text-mint w-8 h-8" />
            </div>
            <h3 className="font-headline text-2xl font-bold mb-3">Founder</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed mb-6">
              Create and manage token streams. Set up hybrid vesting with automated splits for your builders.
            </p>
            <div className="flex flex-wrap gap-2">
              {["Create Streams", "Manage Vesting", "Cancel Streams", "Customize Presets"].map((tag) => (
                <span key={tag} className="font-mono text-[10px] text-mint bg-mint/5 px-2 py-1 rounded-sm uppercase tracking-widest">
                  {tag}
                </span>
              ))}
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ y: -4 }}
            onClick={() => handleSelect("worker")}
            className="glass-plate rounded-lg p-10 text-left hover:border-mint/30 transition-all group cursor-pointer"
          >
            <div className="w-16 h-16 bg-solana-green/10 flex items-center justify-center rounded-sm mb-6 ring-1 ring-solana-green/20 group-hover:bg-solana-green/20 transition-colors">
              <Hammer className="text-solana-green w-8 h-8" />
            </div>
            <h3 className="font-headline text-2xl font-bold mb-3">Worker / Recipient</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed mb-6">
              Track your incoming streams. Monitor progress, claim unlocked tokens, and view earnings history.
            </p>
            <div className="flex flex-wrap gap-2">
              {["View Streams", "Claim Tokens", "Progress Tracking", "Earnings"].map((tag) => (
                <span key={tag} className="font-mono text-[10px] text-solana-green bg-solana-green/5 px-2 py-1 rounded-sm uppercase tracking-widest">
                  {tag}
                </span>
              ))}
            </div>
          </motion.button>
        </div>

        <p className="font-mono text-[10px] text-on-surface-variant/40 mt-8 uppercase tracking-widest">
          You can switch roles anytime from the dashboard
        </p>
      </div>
    </div>
  );
}
