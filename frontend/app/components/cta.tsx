"use client";

import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";

const WAITLIST_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSd91VPqiuJ_ftGuZQT204T2LP7dUiZxLQBBvRLcQP3dfshbeg/viewform?usp=send_form";

export default function CTA() {
  return (
    <section className="py-32 px-6 flex flex-col items-center">
      <motion.div
        whileHover={{ scale: 1.01 }}
        className="glass-plate p-12 rounded-2xl w-full max-w-5xl flex flex-col md:flex-row items-center justify-between gap-12 relative overflow-hidden group"
      >
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-mint/5 blur-[100px] rounded-full group-hover:bg-mint/10 transition-colors" />
        <div className="relative z-10 text-center md:text-left">
          <h2 className="font-headline text-4xl mb-4 font-bold tracking-tight">
            Start paying your team fairly.
          </h2>
          <p className="text-mint font-mono text-xs font-bold tracking-[0.25em] uppercase">
            Be one of the first to use Nirvana
          </p>
        </div>
        <div className="relative z-10 w-full md:w-auto">
          <a
            href={WAITLIST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full md:w-auto bg-mint text-black font-mono text-sm font-bold px-12 py-5 rounded-sm hover:brightness-110 active:scale-95 transition-all shadow-[0_0_40px_rgba(47,243,200,0.3)] uppercase flex items-center justify-center gap-3"
          >
            Join the Waitlist
            <ChevronRight className="w-5 h-5" />
          </a>
        </div>
      </motion.div>
    </section>
  );
}
