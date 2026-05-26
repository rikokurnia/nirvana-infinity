"use client";

import { motion } from "motion/react";
import { BarChart3, ExternalLink, Info } from "lucide-react";

const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || "nirvana.vercel.app";
const PLAUSIBLE_SHARED_LINK = process.env.NEXT_PUBLIC_PLAUSIBLE_SHARED_LINK;

export default function AnalyticsPage() {
  const embedUrl = PLAUSIBLE_SHARED_LINK
    ? `${PLAUSIBLE_SHARED_LINK}&embed=true&theme=dark&background=transparent`
    : null;

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-headline text-3xl font-bold tracking-tight">Analytics</h1>
            <p className="font-mono text-xs text-on-surface-variant mt-2 uppercase tracking-widest">
              Real-time traffic & engagement
            </p>
          </div>
          {embedUrl && (
            <a
              href={PLAUSIBLE_SHARED_LINK!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border border-mint/30 text-mint font-mono text-xs font-bold px-4 py-2 rounded-sm hover:bg-mint/10 transition-all uppercase"
            >
              Open in Plausible
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {embedUrl ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-plate rounded-lg overflow-hidden border-mint/10"
        >
          <iframe
            src={embedUrl}
            className="w-full h-[calc(100vh-13rem)] border-none"
            title="Plausible Analytics"
            loading="lazy"
          />
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-plate rounded-lg p-12 text-center"
        >
          <BarChart3 className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-4" />
          <h3 className="font-headline text-lg font-bold mb-2">Analytics Not Configured</h3>
          <p className="font-mono text-xs text-on-surface-variant/60 max-w-md mx-auto leading-relaxed mb-6">
            Set up Plausible to view your analytics here.
          </p>

          <div className="glass-plate rounded-lg p-6 max-w-xl mx-auto text-left space-y-4">
            <h4 className="font-headline text-sm font-bold text-mint flex items-center gap-2">
              <Info className="w-4 h-4" />
              Setup Steps
            </h4>
            <div className="space-y-3 font-mono text-xs text-on-surface-variant">
              <div className="flex gap-3">
                <span className="text-mint font-bold shrink-0">1.</span>
                <span>
                  Go to{" "}
                  <a
                    href="https://plausible.io/register"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-mint hover:brightness-110 transition-all"
                  >
                    plausible.io
                  </a>{" "}
                  — create a free account (30-day trial) or self-host via Docker
                </span>
              </div>
              <div className="flex gap-3">
                <span className="text-mint font-bold shrink-0">2.</span>
                <span>
                  Add your domain: <span className="text-mint">{PLAUSIBLE_DOMAIN}</span>
                </span>
              </div>
              <div className="flex gap-3">
                <span className="text-mint font-bold shrink-0">3.</span>
                <span>
                  In Plausible → Site Settings → Visibility → enable <span className="text-mint">Public Dashboard</span>
                </span>
              </div>
              <div className="flex gap-3">
                <span className="text-mint font-bold shrink-0">4.</span>
                <span>
                  Copy the Shared Link and set it as{" "}
                  <span className="text-mint">NEXT_PUBLIC_PLAUSIBLE_SHARED_LINK</span> in your
                  .env file
                </span>
              </div>
              <div className="flex gap-3">
                <span className="text-mint font-bold shrink-0">5.</span>
                <span>
                  Update{" "}
                  <span className="text-mint">NEXT_PUBLIC_PLAUSIBLE_DOMAIN</span> in .env to
                  match your actual domain
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
