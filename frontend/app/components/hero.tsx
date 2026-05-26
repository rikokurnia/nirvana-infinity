"use client";

import { motion } from "motion/react";
import { Shield, ChevronRight, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/app/providers/privy-provider";
import { useRouter } from "next/navigation";

const WAITLIST_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSd91VPqiuJ_ftGuZQT204T2LP7dUiZxLQBBvRLcQP3dfshbeg/viewform?usp=send_form";

export default function Hero() {
  const { authenticated } = useAuth();
  const router = useRouter();

  return (
    <section className="pt-40 pb-24 px-6 flex flex-col items-center text-center max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-mint/20 bg-mint/5 mb-8"
      >
        <span className="w-2 h-2 rounded-full bg-mint animate-pulse" />
        <span className="font-mono text-[10px] text-mint tracking-[0.2em] font-bold uppercase">
          Protocol Live for Early Builders
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="font-headline text-5xl md:text-7xl mb-6 max-w-4xl tracking-tighter glow-text leading-[1.1] font-bold"
      >
        Pay your team{" "}
        <span className="mint-gradient-text">
          in tokens. Automatically.
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="font-sans text-lg md:text-xl text-on-surface-variant max-w-2xl mb-12"
      >
        Set up streaming payments for anyone on your team. Tokens flow steadily.
        Builders earn without stress. Projects keep long-term commitment. No
        cliffs, no drama.
      </motion.p>

      {authenticated ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <button
            onClick={() => router.push("/dashboard")}
            className="bg-mint text-black font-mono text-sm font-bold px-10 py-4 rounded-sm hover:brightness-110 active:scale-95 transition-all uppercase flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(47,243,200,0.2)]"
          >
            <LayoutDashboard className="w-4 h-4" />
            Go to Dashboard
          </button>
          <button
            onClick={() => router.push("/dashboard/founder/create")}
            className="border border-mint/30 text-mint font-mono text-sm font-bold px-10 py-4 rounded-sm hover:bg-mint/10 transition-all uppercase flex items-center justify-center gap-2"
          >
            Create Stream
            <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <a
            href={WAITLIST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-mint text-black font-mono text-sm font-bold px-12 py-4 rounded-sm hover:brightness-110 active:scale-95 transition-all uppercase flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(47,243,200,0.2)]"
          >
            Join the Waitlist
            <ChevronRight className="w-4 h-4" />
          </a>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ delay: 0.4 }}
        className="mt-6 flex items-center gap-2 text-on-surface-variant"
      >
        <Shield className="w-4 h-4" />
        <span className="font-mono text-[9px] tracking-[0.25em] font-bold uppercase">
          Smart contract powered & non-custodial
        </span>
      </motion.div>
    </section>
  );
}
