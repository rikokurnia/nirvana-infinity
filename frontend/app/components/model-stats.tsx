"use client";

import { motion } from "motion/react";

const models = [
  {
    title: "Ascend",
    id: "M-01",
    desc: "Earn more as the project grows — tokens scale with milestones and your contributions.",
    progress: 75,
  },
  {
    title: "Balance",
    id: "M-02",
    desc: "The sweet spot between steady income now and bigger token upside later.",
    progress: 50,
  },
  {
    title: "Flow",
    id: "M-03",
    desc: "A smooth, per-second payment stream. No waiting for monthly cliffs.",
    progress: 100,
  },
];

export default function ModelStats() {
  return (
    <section className="px-6 py-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
      {models.map((model, i) => (
        <motion.div
          key={i}
          whileHover={{ y: -5 }}
          className="glass-plate rounded-lg p-8 border-t-2 border-t-mint/40"
        >
          <div className="flex justify-between items-start mb-6">
            <h4 className="font-headline text-2xl text-mint font-bold">
              {model.title}
            </h4>
            <span className="font-mono text-[10px] opacity-40 font-bold">
              {model.id}
            </span>
          </div>
          <p className="text-on-surface-variant text-sm leading-relaxed mb-8 h-12 overflow-hidden">
            {model.desc}
          </p>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${model.progress}%` }}
              transition={{ duration: 1, delay: 0.2 }}
              className="h-full bg-linear-to-r from-mint to-solana-green shadow-[0_0_10px_rgba(47,243,200,0.5)]"
            />
          </div>
        </motion.div>
      ))}
    </section>
  );
}
