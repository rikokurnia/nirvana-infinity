"use client";

import { Github, Twitter, Terminal } from "lucide-react";

export default function Footer() {
  return (
    <footer className="w-full py-16 px-6 border-t border-white/5 max-w-7xl mx-auto bg-black">
      <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-12">
        <div className="flex flex-col items-center md:items-start gap-2">
          <div className="text-2xl font-headline font-bold text-mint tracking-tighter flex items-center gap-2">
            <img src="/images/removbg.png" alt="Nirvana" className="w-6 h-6 object-contain" />
            Nirvana
          </div>
          <p className="font-sans text-sm text-on-surface-variant">
            &copy; 2025 Nirvana Protocol. Precision Vesting.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-8">
          {["Whitepaper", "Governance", "Status", "Security"].map((link) => (
            <a
              key={link}
              href="#"
              className="text-on-surface-variant font-mono text-[10px] font-bold hover:text-mint transition-colors tracking-widest uppercase"
            >
              {link}
            </a>
          ))}
        </div>

        <div className="flex gap-6">
          <Github className="w-5 h-5 text-on-surface-variant hover:text-mint cursor-pointer transition-colors" />
          <Twitter className="w-5 h-5 text-on-surface-variant hover:text-mint cursor-pointer transition-colors" />
          <Terminal className="w-5 h-5 text-on-surface-variant hover:text-mint cursor-pointer transition-colors" />
        </div>
      </div>
    </footer>
  );
}
