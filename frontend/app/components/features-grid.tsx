"use client";

import { motion } from "motion/react";
import { Terminal, Lock, Cpu } from "lucide-react";

export default function FeaturesGrid() {
  return (
    <section className="px-6 py-12 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6">
      <motion.div
        whileHover={{ y: -5 }}
        className="md:col-span-8 glass-plate rounded-lg p-10 flex flex-col justify-between overflow-hidden relative group"
      >
        <div className="relative z-10">
          <span className="text-mint font-mono text-[10px] font-bold mb-4 block uppercase tracking-widest">
            01 / How It Works
          </span>
          <h3 className="font-headline text-3xl text-on-surface mb-4 font-bold tracking-tight">
            Set It and Forget It
          </h3>
          <p className="text-on-surface-variant max-w-md leading-relaxed">
            One-time setup. Tokens flow automatically to your team on a schedule you choose. Linear payments keep builders paid. Milestone bonuses keep them motivated.
          </p>
        </div>
        <div className="mt-12 h-64 w-full border border-hairline-soft rounded-lg relative overflow-hidden bg-black/40">
          <img
            className="w-full h-full object-cover opacity-60 group-hover:opacity-90 transition-opacity duration-700"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBQGb2Wops8I_rnRliMHyY0eZAHoi6RX7DkXqHNoWjQiMNR785sLShpdkpiMy5x5bxZsu_bz2AMpDmYL0YoEQmpt4qf_kTvDayyDmtWUz0tJlvjXKwtWe_4vl2OEEDjvSIupnmBxv9gYPeDAP-iwp81DOXLvnH8fHK5uZP0Gf8qxx5NrN-Da30LVEEvx66DtPkfsJKQlNAJ2l1UKaNdqGGwfCizeqWrktVR64Aiu-TdTKAYG-yi2YbeOEcw6eDtq8jS0V-hpcOqXd9J"
            alt="Technical Diagram"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/80 to-transparent" />
        </div>
      </motion.div>

      <motion.div
        whileHover={{ y: -5 }}
        className="md:col-span-4 glass-plate rounded-lg p-10 flex flex-col bg-mint/[0.02] border-mint/10"
      >
        <div className="w-16 h-16 bg-mint/10 flex items-center justify-center rounded-sm mb-8 ring-1 ring-mint/20">
          <Terminal className="text-mint w-8 h-8" />
        </div>
        <h3 className="font-headline text-3xl text-on-surface mb-6 font-bold tracking-tight">
          Trust Through Code
        </h3>
        <p className="text-on-surface-variant leading-relaxed mb-10">
          Smart contracts handle everything. No manual approvals, no arguments. Just math that everyone can verify.
        </p>
        <ul className="space-y-4 mt-auto">
          {[
            { icon: Lock, label: "Immutable Smart Contracts" },
            { icon: Cpu, label: "Real-time Auditing" },
          ].map((item, id) => (
            <li
              key={id}
              className="flex items-center gap-3 font-mono text-[10px] text-mint font-bold uppercase tracking-widest"
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}
